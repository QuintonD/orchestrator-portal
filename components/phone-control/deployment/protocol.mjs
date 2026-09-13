// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ../ATTRIBUTION.md.
export const MAX_REQUEST = 16 * 1024;
export const MAX_RESPONSE = 8 * 1024 * 1024;
export const MAX_FRAME = 12 * 1024 * 1024;
export const LOCAL_TOKEN = 'isolated-channel-no-bearer-secret';

export function routeAllowed(method, path) {
  return (method === 'GET' && /^\/v1\/(?:state|legal|tasks\/[A-Za-z0-9_-]{1,128}|receipts\/[A-Za-z0-9_-]{1,128})$/u.test(path)) ||
    (method === 'POST' && ['/v1/call', '/v1/tasks'].includes(path)) ||
    (method === 'DELETE' && /^\/v1\/tasks\/[A-Za-z0-9_-]{1,128}$/u.test(path));
}

export function validRequest(frame) {
  return frame && typeof frame === 'object' && !Array.isArray(frame) &&
    Object.keys(frame).every((key) => ['type', 'id', 'method', 'path', 'body', 'nonce'].includes(key)) &&
    frame.type === 'request' && typeof frame.id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(frame.id) &&
    typeof frame.path === 'string' && routeAllowed(frame.method, frame.path) &&
    typeof frame.body === 'string' && Buffer.byteLength(frame.body) <= MAX_REQUEST &&
    (frame.method === 'POST' || frame.body === '') &&
    (frame.nonce === undefined || (typeof frame.nonce === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(frame.nonce)));
}

// Both the transport and its parser are bounded before JSON is interpreted.
export function readFrames(stream, callback, onError, maxBytes = MAX_FRAME) {
  let pending = Buffer.alloc(0); let failed = false;
  const fail = () => { if (!failed) { failed = true; onError(new Error('isolation_protocol_invalid')); } };
  stream.on('data', (chunk) => {
    if (failed) return;
    pending = Buffer.concat([pending, chunk]);
    let index;
    while ((index = pending.indexOf(10)) !== -1) {
      if (index > maxBytes) { fail(); return; }
      const line = pending.subarray(0, index); pending = pending.subarray(index + 1);
      try { callback(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line))); } catch { fail(); return; }
    }
    if (pending.length > maxBytes) fail();
  });
  stream.on('end', () => { if (pending.length) fail(); });
  stream.on('error', fail);
}

export function sendFrame(stream, frame) {
  const data = JSON.stringify(frame);
  if (Buffer.byteLength(data) > MAX_FRAME || stream.destroyed || stream.writableLength > MAX_FRAME * 2) throw new Error('isolation_transport_unavailable');
  stream.write(`${data}\n`);
}
