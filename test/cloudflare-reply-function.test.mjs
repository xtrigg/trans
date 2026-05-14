import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReplyTranslationPrompt,
  onRequestPost
} from '../functions/api/openai/reply-translation.js';

test('reply translation prompt asks for speakable meeting English', () => {
  const prompt = buildReplyTranslationPrompt('老师您好，我想确认明天的接送时间。');

  assert.match(prompt.input, /老师您好/);
  assert.match(prompt.instructions, /spoken English/);
  assert.match(prompt.instructions, /short_version/);
  assert.equal(prompt.text.format.type, 'json_schema');
});

test('reply translation function refuses empty Chinese input', async () => {
  const response = await onRequestPost({
    env: { OPENAI_API_KEY: 'test-key' },
    request: new Request('https://example.com/api/openai/reply-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '   ' })
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /中文/);
});

test('reply translation function calls OpenAI Responses API and normalizes output', async () => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;

  globalThis.fetch = async (url, init) => {
    capturedRequest = { url, init };
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        english: 'Good morning, I would like to confirm tomorrow pickup time.',
        short_version: 'Could we confirm tomorrow pickup time?',
        notes: 'Polite parent-teacher wording.'
      })
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = await onRequestPost({
      env: { OPENAI_API_KEY: 'test-key', OPENAI_REPLY_MODEL: 'gpt-5.2' },
      request: new Request('https://example.com/api/openai/reply-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '早上好，我想确认明天接送时间。' })
      })
    });
    const body = await response.json();
    const forwardedPayload = JSON.parse(capturedRequest.init.body);

    assert.equal(response.status, 200);
    assert.equal(capturedRequest.url, 'https://api.openai.com/v1/responses');
    assert.equal(capturedRequest.init.headers.Authorization, 'Bearer test-key');
    assert.equal(forwardedPayload.model, 'gpt-5.2');
    assert.equal(body.english, 'Good morning, I would like to confirm tomorrow pickup time.');
    assert.equal(body.shortVersion, 'Could we confirm tomorrow pickup time?');
    assert.equal(body.notes, 'Polite parent-teacher wording.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
