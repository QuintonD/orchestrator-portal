// SPDX-License-Identifier: AGPL-3.0-only
// Required origin notice: see ATTRIBUTION.md.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { requireThat } from './validation.mjs';

export function generateResponseIdentity() {
  return generateKeyPairSync('ed25519', { privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
}
export function requestHash(input) { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }
export function bodyHash(text) { return createHash('sha256').update(text, 'utf8').digest('hex'); }
function httpPayload({ nonce, method, path, requestHash: request, status, bodyHash: response }) {
  requireThat(typeof nonce === 'string' && /^[A-Za-z0-9_-]{16,96}$/u.test(nonce), 'invalid_response_proof');
  requireThat(['GET', 'POST', 'DELETE'].includes(method) && typeof path === 'string' && /^\/v1\/[A-Za-z0-9_/-]{1,256}$/u.test(path), 'invalid_response_proof');
  requireThat(typeof request === 'string' && /^[a-f0-9]{64}$/u.test(request) && typeof response === 'string' && /^[a-f0-9]{64}$/u.test(response), 'invalid_response_proof');
  requireThat(Number.isInteger(status) && status >= 200 && status <= 599, 'invalid_response_proof');
  return Buffer.from(JSON.stringify(['orchestrator-phone-control/http-response/v1', nonce, method, path, request, status, response]));
}
export function signHttpResponse({ privateKey, ...fields }) {
  const key = createPrivateKey(privateKey); requireThat(key.asymmetricKeyType === 'ed25519', 'invalid_broker_private_key');
  return sign(null, httpPayload(fields), key).toString('base64url');
}
export function verifyHttpResponse({ publicKey, signature, ...fields }) {
  try {
    if (typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/u.test(signature)) return false;
    return verify(null, httpPayload(fields), validateBrokerPublicKey(publicKey), Buffer.from(signature, 'base64url'));
  } catch { return false; }
}
export function validateBrokerPublicKey(publicKey) {
  try { requireThat(typeof publicKey === 'string' && publicKey.length <= 2048); const key = createPublicKey(publicKey); requireThat(key.asymmetricKeyType === 'ed25519'); return key; }
  catch { requireThat(false, 'invalid_broker_public_key'); }
}
