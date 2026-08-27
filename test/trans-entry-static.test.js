const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('trans entry serves the translator without client-side redirecting to old root paths', () => {
  const html = fs.readFileSync(path.join(root, 'public', 'trans', 'index.html'), 'utf8');

  assert.match(html, /<title>实时语音翻译<\/title>/);
  assert.match(html, /id="startBtn"/);
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.doesNotMatch(html, /location\.replace/);
  assert.doesNotMatch(html, /url=\/realtime-translation-poc\.html/);
});
