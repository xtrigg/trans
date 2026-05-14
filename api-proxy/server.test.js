const assert = require('node:assert/strict');
const test = require('node:test');

const proxy = require('./server');

test('exports app factory and realtime translation session payload builder', () => {
  assert.equal(typeof proxy.createApp, 'function');
  assert.equal(typeof proxy.buildRealtimeTranslationSessionPayload, 'function');
});

test('builds a gpt-realtime-translate session payload with only supported target language', () => {
  const payload = proxy.buildRealtimeTranslationSessionPayload({
    targetLanguage: 'zh',
    sourceLanguage: 'en',
    voice: 'alloy'
  });

  assert.equal(payload.session.model, 'gpt-realtime-translate');
  assert.equal(payload.session.audio.output.language, 'zh');
  assert.equal('input' in payload.session.audio, false);
  assert.equal('voice' in payload.session.audio.output, false);
});

test('realtime translation endpoint refuses missing OpenAI key', async () => {
  const app = proxy.createApp({ openaiApiKey: '' });
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/openai/realtime-translation/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh' })
    });
    const body = await resp.json();

    assert.equal(resp.status, 500);
    assert.match(body.error, /OpenAI API/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('api-proxy prefixed realtime translation endpoint also works for local POC', async () => {
  const app = proxy.createApp({ openaiApiKey: '' });
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const resp = await fetch(`http://127.0.0.1:${port}/api-proxy/api/openai/realtime-translation/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: 'zh' })
    });

    assert.equal(resp.status, 500);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('api-proxy prefixed reply translation endpoint refuses missing OpenAI key', async () => {
  const app = proxy.createApp({ openaiApiKey: '' });
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const resp = await fetch(`http://127.0.0.1:${port}/api-proxy/api/openai/reply-translation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '我想确认明天早上的会议时间。' })
    });
    const body = await resp.json();

    assert.equal(resp.status, 500);
    assert.match(body.error, /OpenAI API/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('api-proxy prefixed reply speech endpoint refuses missing OpenAI key', async () => {
  const app = proxy.createApp({ openaiApiKey: '' });
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const resp = await fetch(`http://127.0.0.1:${port}/api-proxy/api/openai/reply-speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Hello, teacher.' })
    });
    const body = await resp.json();

    assert.equal(resp.status, 500);
    assert.match(body.error, /OpenAI API/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('serves realtime translation POC from the proxy for local development', async () => {
  const app = proxy.createApp({ openaiApiKey: '' });
  const server = app.listen(0);

  try {
    const port = server.address().port;
    const resp = await fetch(`http://127.0.0.1:${port}/realtime-translation-poc.html`);
    const html = await resp.text();

    assert.equal(resp.status, 200);
    assert.match(html, /实时语音翻译/);
    assert.match(html, /开始录音并实时翻译/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
