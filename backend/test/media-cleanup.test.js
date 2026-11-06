const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { localUploadPath } = require('../src/services/mediaCleanup');

test('local media cleanup only accepts app-relative upload URLs', () => {
  const target = localUploadPath('/uploads/unique-video.mp4');
  assert.ok(target);
  assert.equal(path.basename(target), 'unique-video.mp4');
  assert.equal(localUploadPath('https://attacker.example/uploads/important.txt'), null);
  assert.equal(localUploadPath('https://res.cloudinary.com/demo/image/upload/file.jpg'), null);
  assert.equal(localUploadPath('/private/important.txt'), null);
});

test('local upload cleanup confines path resolution to the upload directory', () => {
  const target = localUploadPath('/uploads/../../.env');
  assert.ok(target);
  assert.equal(path.basename(target), '.env');
  assert.equal(path.dirname(target), path.resolve('uploads'));
});
