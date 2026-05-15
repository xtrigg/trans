import assert from 'node:assert/strict';
import test from 'node:test';

import { getUpstreamUrl } from '../cloudflare/xcu-trans-router.js';

test('router maps original xcu.ai trans entry to Pages UI', () => {
  assert.equal(
    getUpstreamUrl('https://xcu.ai/trans/').toString(),
    'https://trans-c2s.pages.dev/realtime-translation-poc'
  );
});

test('router maps trans static assets to Pages assets', () => {
  assert.equal(
    getUpstreamUrl('https://xcu.ai/trans/realtime-translation.mjs').toString(),
    'https://trans-c2s.pages.dev/realtime-translation.mjs'
  );
});

test('router maps realtime session API to Pages Function', () => {
  assert.equal(
    getUpstreamUrl('https://xcu.ai/api-proxy/api/openai/realtime-translation/session').toString(),
    'https://trans-c2s.pages.dev/api-proxy/api/openai/realtime-translation/session'
  );
});

test('router maps reply translation API to Pages Function', () => {
  assert.equal(
    getUpstreamUrl('https://xcu.ai/api-proxy/api/openai/reply-translation').toString(),
    'https://trans-c2s.pages.dev/api-proxy/api/openai/reply-translation'
  );
});

test('router maps reply speech API to Pages Function', () => {
  assert.equal(
    getUpstreamUrl('https://xcu.ai/api-proxy/api/openai/reply-speech').toString(),
    'https://trans-c2s.pages.dev/api-proxy/api/openai/reply-speech'
  );
});

test('router maps economical text translation API to Pages Function', () => {
  assert.equal(
    getUpstreamUrl('https://xcu.ai/api-proxy/api/openai/text-translation').toString(),
    'https://trans-c2s.pages.dev/api-proxy/api/openai/text-translation'
  );
});

test('router rejects unrelated paths', () => {
  assert.equal(getUpstreamUrl('https://xcu.ai/other'), null);
});
