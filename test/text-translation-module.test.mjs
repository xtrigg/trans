import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendSegmentText,
  buildTextTranslationRequestBody,
  isRecoverableAudioError,
  getSupportedMimeType
} from '../public/text-translation.mjs';

test('builds economical text translation request body from recorded audio', async () => {
  const blob = new Blob(['audio-bytes'], { type: 'audio/webm' });
  const body = await buildTextTranslationRequestBody({
    audioBlob: blob,
    targetLanguage: 'zh',
    previousTranscript: 'Good morning.'
  });

  assert.equal(body.mimeType, 'audio/webm');
  assert.equal(body.targetLanguage, 'zh');
  assert.equal(body.previousTranscript, 'Good morning.');
  assert.equal(typeof body.audioBase64, 'string');
  assert.ok(body.audioBase64.length > 0);
});

test('appends source and target segment text with separators', () => {
  const state = { sourceText: 'Hello', targetText: '你好' };
  appendSegmentText(state, {
    sourceText: 'Welcome parents.',
    targetText: '欢迎各位家长。'
  });

  assert.equal(state.sourceText, 'Hello\nWelcome parents.');
  assert.equal(state.targetText, '你好\n欢迎各位家长。');
});

test('selects a supported MediaRecorder mime type with fallback', () => {
  const originalMediaRecorder = globalThis.MediaRecorder;
  globalThis.MediaRecorder = {
    isTypeSupported(type) {
      return type === 'audio/webm;codecs=opus';
    }
  };

  try {
    assert.equal(getSupportedMimeType(), 'audio/webm;codecs=opus');
  } finally {
    globalThis.MediaRecorder = originalMediaRecorder;
  }
});

test('treats corrupted or unsupported audio transcription as recoverable', () => {
  assert.equal(isRecoverableAudioError(new Error('Audio file might be corrupted or unsupported')), true);
  assert.equal(isRecoverableAudioError(new Error('OpenAI API密钥未配置')), false);
});
