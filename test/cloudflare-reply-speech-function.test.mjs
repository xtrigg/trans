import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReplySpeechPayload,
  onRequestPost
} from '../functions/api/openai/reply-speech.js';

test('reply speech payload uses a TTS model and disclosure-friendly instructions', () => {
  const payload = buildReplySpeechPayload({
    text: 'Hello, teacher. I would like to confirm the pickup time.',
    voice: 'coral'
  });

  assert.equal(payload.model, 'gpt-4o-mini-tts');
  assert.equal(payload.voice, 'coral');
  assert.match(payload.input, /pickup time/);
  assert.match(payload.instructions, /Clear/);
  assert.equal(payload.response_format, 'mp3');
});

test('reply speech function refuses empty English text', async () => {
  const response = await onRequestPost({
    env: { OPENAI_API_KEY: 'test-key' },
    request: new Request('https://example.com/api/openai/reply-speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ' })
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /英文/);
});

test('reply speech function returns generated mp3 audio', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;

  globalThis.fetch = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  };

  try {
    const response = await onRequestPost({
      env: { OPENAI_API_KEY: 'test-key', OPENAI_TTS_MODEL: 'gpt-4o-mini-tts' },
      request: new Request('https://example.com/api/openai/reply-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello, teacher.', voice: 'marin' })
      })
    });
    const audio = new Uint8Array(await response.arrayBuffer());
    const forwardedPayload = JSON.parse(capturedRequest.init.body);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
    assert.deepEqual([...audio], [1, 2, 3]);
    assert.equal(capturedRequest.url, 'https://api.openai.com/v1/audio/speech');
    assert.equal(capturedRequest.init.headers.Authorization, 'Bearer test-key');
    assert.equal(forwardedPayload.model, 'gpt-4o-mini-tts');
    assert.equal(forwardedPayload.voice, 'marin');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
