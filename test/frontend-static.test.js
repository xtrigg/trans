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
