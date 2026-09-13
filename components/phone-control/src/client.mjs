// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertPrivate } from './security.mjs';
import { Fault, requireThat, number, captureDetails, MAX_BODY_BYTES, MAX_NATIVE_BYTES } from './validation.mjs';
import { bodyHash, verifyHttpResponse, validateBrokerPublicKey } from './response-proof.mjs';

const definiteRejections = new WeakSet();
export function isDefiniteRejection(error) { return error instanceof Fault && definiteRejections.has(error); }
function unsent(code) { const failure = new Fault(code, 409); definiteRejections.add(failure); return failure; }
function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function clientToken({ tokenFile, environment = process.env }) {
  let value;
  if (tokenFile) { assertPrivate(tokenFile); value = readFileSync(tokenFile, 'utf8').trim(); }
  else value = environment.PHONE_CONTROL_TOKEN;
  requireThat(typeof value === 'string' && value.length >= 24 && value.length <= 256 && !/\s/u.test(value), 'token_required'); return value;
}
export function createClient({ port = 4421, secret, fetchImpl = fetch, timeoutMs = 60_000, brokerPublicKey }) {
  number(port, 1024, 65535); number(timeoutMs, 1, 60_000); const origin = `http://127.0.0.1:${port}`;
  if (brokerPublicKey !== undefined) validateBrokerPublicKey(brokerPublicKey);
  return async (path, method = 'GET', input, { signal } = {}) => {
    requireThat(/^\/v1\/(?:state|legal|audit|call|credentials(?:\/[A-Za-z0-9_-]+)?|sessions(?:\/[A-Za-z0-9_-]+)?|tasks(?:\/[A-Za-z0-9_-]+)?|receipts\/[A-Za-z0-9_-]+|devices\/[A-Za-z0-9_-]+\/stop)$/u.test(path), 'invalid_route');
    requireThat(['GET', 'POST', 'DELETE'].includes(method), 'invalid_method');
    requireThat(signal === undefined || signal instanceof AbortSignal, 'invalid_signal');
    if (signal?.aborted) throw unsent('request_cancelled');
    const stop = method === 'POST' && (path === '/v1/call' && input?.method === 'stop' || /^\/v1\/devices\/[A-Za-z0-9_-]+\/stop$/u.test(path));
    if (!brokerPublicKey && !stop) throw unsent('broker_public_key_required');
    const body = input === undefined ? undefined : JSON.stringify(input); if (body) requireThat(Buffer.byteLength(body) <= MAX_BODY_BYTES, 'request_too_large', 413);
    const nonce = randomUUID(); const read = method === 'GET' || path === '/v1/call' && ['observe', 'describe', 'apps.list'].includes(input?.method);
    const combined = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
    let response;
    try { response = await abortable(fetchImpl(`${origin}${path}`, { method, redirect: 'error', headers: { authorization: `Bearer ${secret}`, 'x-phone-request-nonce': nonce, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body } : {}), signal: combined }), combined); }
    catch { throw new Fault(read ? signal?.aborted ? 'request_cancelled' : 'broker_unavailable' : 'outcome_unknown', 502); }
    const reader = response.body?.getReader(); let size = 0; const chunks = [];
    try {
      requireThat(reader, 'broker_response_invalid', 502);
      while (true) { const { value, done } = await abortable(reader.read(), combined); if (done) break; size += value.length; requireThat(size <= MAX_NATIVE_BYTES, 'broker_response_too_large', 502); chunks.push(value); }
      let raw; try { raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); } catch { throw new Fault('broker_response_invalid', 502); }
      requireThat(brokerPublicKey && verifyHttpResponse({ publicKey: brokerPublicKey, nonce, method, path, requestHash: bodyHash(body ?? ''), status: response.status, bodyHash: bodyHash(raw), signature: response.headers.get('x-phone-response-signature') }), 'broker_response_untrusted', 502);
      let result; try { result = JSON.parse(raw); } catch { throw new Fault('broker_response_invalid', 502); }
      if (!response.ok) {
        const code = typeof result?.error?.code === 'string' && /^[a-z_]{1,60}$/u.test(result.error.code) ? result.error.code : 'broker_request_failed';
        let details;
        try { details = captureDetails(result.error?.details, code.startsWith('screenshot_')); }
        catch { throw new Fault('broker_response_invalid', 502); }
        const failure = new Fault(code, response.status, details);
        if (path === '/v1/call' && method === 'POST' && result.dispatch?.state === 'not_dispatched' && result.dispatch.requestHash === bodyHash(body ?? '')) definiteRejections.add(failure);
        if (path === '/v1/call' && method === 'POST' && !read && !definiteRejections.has(failure)) throw new Fault('outcome_unknown', 502);
        throw failure;
      }
      return result;
    } catch (error) {
      if (!(error instanceof Fault) || error.code.startsWith('broker_response')) throw new Fault(read ? signal?.aborted ? 'request_cancelled' : error?.code === 'broker_response_untrusted' ? 'broker_response_untrusted' : 'broker_response_invalid' : 'outcome_unknown', 502);
      throw error;
    } finally { void reader?.cancel().catch(() => {}); }
  };
}
