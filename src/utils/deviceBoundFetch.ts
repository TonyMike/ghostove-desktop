import { isTauri } from '@tauri-apps/api/core';
import { BACKEND_API_URL } from './config';
import { signDeviceChallenge } from './device';
import { AuthenticationError, notifyAuthenticationFailure } from './authEvents';

const CHALLENGE_ID_HEADER = 'X-Ghostove-Device-Challenge';
const DEVICE_PROOF_HEADER = 'X-Ghostove-Device-Proof';
const CHALLENGE_PATH = '/api/auth/device-challenge';

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Signs each authenticated desktop HTTP operation with a single-use device-key challenge. */
export async function deviceBoundFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const requestUrl = new URL(request.url);
  const backendOrigin = new URL(BACKEND_API_URL).origin;
  if (requestUrl.origin !== backendOrigin || requestUrl.pathname === CHALLENGE_PATH) {
    return fetch(request);
  }

  const headers = new Headers(request.headers);
  const queryToken = requestUrl.searchParams.get('token');
  const authorization = headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || queryToken;
  if (!token) return fetch(request);
  if (!isTauri()) throw new Error('Secure desktop request signing is available only in Ghostove Desktop.');

  // Keep bearer credentials out of URLs and access logs.
  if (queryToken) {
    requestUrl.searchParams.delete('token');
    headers.set('Authorization', `Bearer ${token}`);
  }
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const bodyBytes = await request.clone().arrayBuffer();
  const bodySha256 = toHex(await crypto.subtle.digest('SHA-256', bodyBytes));
  const response = await fetch(`${BACKEND_API_URL}${CHALLENGE_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      purpose: 'http',
      method: request.method.toUpperCase(),
      path,
      contentType: request.headers.get('Content-Type') || '',
      bodySha256,
    }),
  });
  const challengeData = await response.json().catch(() => ({}));
  if (!response.ok || !challengeData.challengeId || !challengeData.challenge) {
    if (response.status === 401) notifyAuthenticationFailure();
    if (response.status === 401) {
      throw new AuthenticationError(
        challengeData.detail || 'Your Ghostove session expired. Pair this computer again from Ghostove Web.',
      );
    }
    throw new Error(challengeData.detail || 'Could not verify this desktop request. Pair this computer again from Ghostove Web.');
  }

  const signature = await signDeviceChallenge(challengeData.challenge);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set(CHALLENGE_ID_HEADER, challengeData.challengeId);
  headers.set(DEVICE_PROOF_HEADER, signature);
  const method = request.method.toUpperCase();
  const result = await fetch(new Request(requestUrl.toString(), {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : bodyBytes,
    credentials: request.credentials,
    mode: request.mode,
    cache: request.cache,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    signal: request.signal,
  }));
  if (result.status === 401) notifyAuthenticationFailure();
  return result;
}
