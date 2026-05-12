import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRealtimeLanguage,
  buildSessionRequestBody,
  collectRealtimeEventText
} from '../public/realtime-translation.mjs';

test('maps display languages to OpenAI realtime language codes', () => {
  assert.equal(getRealtimeLanguage('zh'), 'zh');
  assert.equal(getRealtimeLanguage('en'), 'en');
  assert.equal(getRealtimeLanguage('中文'), 'zh');
});

test('builds session request body for translation target', () => {
  const body = buildSessionRequestBody({ sourceLanguage: 'en', targetLanguage: 'zh', voice: 'alloy' });

  assert.equal(body.targetLanguage, 'zh');
  assert.equal('sourceLanguage' in body, false);
  assert.equal('voice' in body, false);
});

test('collects source and target transcript deltas from realtime events', () => {
  const state = { sourceText: '', targetText: '' };
  collectRealtimeEventText(state, { type: 'session.input_transcript.delta', delta: 'hello' });
  collectRealtimeEventText(state, { type: 'session.output_transcript.delta', delta: '你好' });

  assert.equal(state.sourceText, 'hello');
  assert.equal(state.targetText, '你好');
});
