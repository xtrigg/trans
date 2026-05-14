import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRealtimeTranslationSessionPayload,
  onRequestPost
} from '../functions/api/openai/realtime-translation/session.js';

test('cloudflare function builds supported realtime translation payload', () => {
  const payload = buildRealtimeTranslationSessionPayload({
    targetLanguage: 'Chinese',
    sourceLanguage: 'en',
    voice: 'alloy'
  });

  assert.equal(payload.session.model, 'gpt-realtime-translate');
  assert.equal(payload.session.audio.output.language, 'zh');
  assert.equal('input' in payload.session.audio, false);
  assert.equal('voice' in payload.session.audio.output, false);
});

test('cloudflare function refuses missing OpenAI key', async () => {
  const response = await onRequestPost({
    env: {},
    request: new Request('https://example.com/api/openai/realtime-translation/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh' })
    })
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.match(body.error, /OpenAI API/);
});

test('cloudflare function forwards payload to OpenAI with a server-side key', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;

  globalThis.fetch = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify({ client_secret: { value: 'test-secret' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = await onRequestPost({
      env: { OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.com/api/openai/realtime-translation/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': 'unit-test-user'
        },
        body: JSON.stringify({ targetLanguage: 'en' })
      })
    });
    const body = await response.json();
    const forwardedPayload = JSON.parse(capturedRequest.init.body);

    assert.equal(response.status, 200);
    assert.equal(body.client_secret.value, 'test-secret');
    assert.equal(capturedRequest.url, 'https://api.openai.com/v1/realtime/translations/client_secrets');
    assert.equal(capturedRequest.init.headers.Authorization, 'Bearer test-key');
    assert.equal(capturedRequest.init.headers['OpenAI-Safety-Identifier'], 'unit-test-user');
    assert.equal(forwardedPayload.session.audio.output.language, 'en');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
