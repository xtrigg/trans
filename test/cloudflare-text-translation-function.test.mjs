import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTextTranslationPrompt,
  onRequestPost
} from '../functions/api/openai/text-translation.js';

test('text translation prompt preserves meeting meaning in Chinese', () => {
  const payload = buildTextTranslationPrompt({
    transcript: 'The pickup time is 8:30 tomorrow morning.',
    targetLanguage: 'zh'
  });

  assert.equal(payload.model, 'gpt-5.2');
  assert.match(payload.instructions, /professional live meeting interpreter/);
  assert.match(payload.input, /pickup time/);
  assert.equal(payload.text.format.type, 'json_schema');
});

test('text translation function refuses missing audio', async () => {
  const response = await onRequestPost({
    env: { OPENAI_API_KEY: 'test-key' },
    request: new Request('https://example.com/api/openai/text-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: '' })
    })
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /音频/);
});

test('text translation function transcribes audio and translates transcript', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes('/audio/transcriptions')) {
      return new Response(JSON.stringify({ text: 'The pickup time is 8:30 tomorrow morning.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        translation: '明天早上八点半接送。',
        summary: '接送时间是明天早上八点半。'
      })
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const response = await onRequestPost({
      env: { OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.com/api/openai/text-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: Buffer.from('audio-bytes').toString('base64'),
          mimeType: 'audio/webm',
          targetLanguage: 'zh'
        })
      })
    });
    const body = await response.json();
    const translationPayload = JSON.parse(calls[1].init.body);

    assert.equal(response.status, 200);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
    assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
    assert.match(translationPayload.input, /8:30/);
    assert.equal(body.sourceText, 'The pickup time is 8:30 tomorrow morning.');
    assert.equal(body.targetText, '明天早上八点半接送。');
    assert.equal(body.summary, '接送时间是明天早上八点半。');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('text translation function skips recoverable unsupported audio chunks', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(JSON.stringify({
    error: {
      message: 'Audio file might be corrupted or unsupported'
    }
  }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });

  try {
    const response = await onRequestPost({
      env: { OPENAI_API_KEY: 'test-key' },
      request: new Request('https://example.com/api/openai/text-translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: Buffer.from('bad-audio').toString('base64'),
          mimeType: 'audio/webm',
          targetLanguage: 'zh'
        })
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.skipped, true);
    assert.match(body.warning, /音频片段/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
