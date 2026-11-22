// Duplicate sound check: the file hash is a stable SHA-256 of the file's bytes
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { fileSha256 } = require('../src/utils/audioFile');

test('file hash matches the SHA-256 of the file bytes', async () => {
  const file = path.join(__dirname, '..', 'package.json');
  const expected = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.equal(await fileSha256(file), expected);
  assert.equal(expected.length, 64);
});
