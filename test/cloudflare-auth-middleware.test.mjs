import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/_middleware.js';

const env = {
  TRANS_ACCESS_PASSWORD: 'test-password',
  TRANS_ACCESS_SECRET: 'test-secret'
};

function makeContext({ url = 'https://trans-c2s.pages.dev/trans/', method = 'GET', body, headers = {} } = {}) {
  return {
    request: new Request(url, { method, body, headers }),
    env,
    next: () => new Response('NEXT', { status: 200 })
  };
}

test('protects the translation page with a password form', async () => {
  const response = await onRequest(makeContext());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /翻译工具访问验证/);
  assert.match(html, /name="password"/);
});

test('rejects protected API requests without a trusted browser cookie', async () => {
  const response = await onRequest(makeContext({
    url: 'https://trans-c2s.pages.dev/api-proxy/api/openai/realtime-translation/session',
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json' }
  }));

  assert.equal(response.status, 401);
  assert.equal(await response.text(), 'Unauthorized');
});

test('sets a trusted browser cookie after correct password', async () => {
  const body = new URLSearchParams({ password: 'test-password', next: '/trans/' });
  const response = await onRequest(makeContext({
    url: 'https://trans-c2s.pages.dev/trans-login',
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/trans/');
  assert.match(response.headers.get('Set-Cookie') || '', /xcu_trans_auth=/);
  assert.match(response.headers.get('Set-Cookie') || '', /HttpOnly/);
});

test('allows protected requests with a trusted browser cookie', async () => {
  const loginBody = new URLSearchParams({ password: 'test-password', next: '/trans/' });
  const login = await onRequest(makeContext({
    url: 'https://trans-c2s.pages.dev/trans-login',
    method: 'POST',
    body: loginBody,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }));
  const cookie = login.headers.get('Set-Cookie').split(';')[0];

  const response = await onRequest(makeContext({
    headers: { Cookie: cookie }
  }));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'NEXT');
});
