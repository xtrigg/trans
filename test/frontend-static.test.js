const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('legacy trans page no longer references removed manual language controls', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'trans.html'), 'utf8');

  assert.equal(html.includes('manualMainLang'), false);
  assert.equal(html.includes('manualTargetLang'), false);
});

test('realtime translation POC page and module exist', () => {
  assert.equal(fs.existsSync(path.join(root, 'public', 'realtime-translation-poc.html')), true);
  assert.equal(fs.existsSync(path.join(root, 'public', 'realtime-translation.mjs')), true);
});

test('realtime meeting page exposes listening and reply work areas', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'realtime-translation-poc.html'), 'utf8');

  assert.match(html, /我听别人/);
  assert.match(html, /我要回复/);
  assert.match(html, /id="replyChineseInput"/);
  assert.match(html, /id="replyEnglishText"/);
  assert.match(html, /说中文生成英文/);
  assert.match(html, /Alt \+ A/);
});

test('reply work area can use meeting context and play generated English audio', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'realtime-translation-poc.html'), 'utf8');

  assert.match(html, /id="replyUseContext"/);
  assert.match(html, /使用会议上下文/);
  assert.match(html, /id="replyPlayAudioBtn"/);
  assert.match(html, /播放英文语音/);
  assert.match(html, /id="replyAudio"/);
  assert.match(html, /AI 生成语音/);
  assert.match(html, /contextSource/);
  assert.match(html, /contextTranslation/);
});

test('listening work area can disable translated Chinese speech playback', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'realtime-translation-poc.html'), 'utf8');

  assert.match(html, /id="listenAudioEnabled"/);
  assert.match(html, /听中文译声/);
  assert.match(html, /playTranslatedAudio: listenAudioEnabled\.checked/);
  assert.match(html, /translator\.setOutputAudioEnabled\(listenAudioEnabled\.checked\)/);
});

test('legacy trans page exposes a visible status message target', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'trans.html'), 'utf8');

  assert.equal(html.includes('id="statusMessage"'), true);
  assert.equal(html.includes('function showUserError'), true);
});

test('legacy history loading preserves select-all control before binding', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'trans.html'), 'utf8');

  assert.equal(html.includes('function ensureSelectAllControl'), true);
  assert.equal(html.includes('ensureSelectAllControl().addEventListener'), true);
});
