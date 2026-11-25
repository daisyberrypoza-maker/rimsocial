const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { detectFromBuffer } = require('../src/utils/fileSignature');

const bytes = (...values) => Buffer.from(values);
const pad = (buf) => Buffer.concat([buf, Buffer.alloc(32)]);
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('real photo, video and audio headers are recognised', () => {
  assert.equal(detectFromBuffer(pad(bytes(0xff, 0xd8, 0xff, 0xe0)))?.kind, 'photo');
  assert.equal(detectFromBuffer(pad(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)))?.kind, 'photo');
  assert.equal(detectFromBuffer(pad(Buffer.from('GIF89a')))?.kind, 'photo');
  assert.equal(detectFromBuffer(pad(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')))?.mime, 'image/webp');
  assert.equal(detectFromBuffer(pad(Buffer.concat([Buffer.from('\0\0\0\x18'), Buffer.from('ftypisom')])))?.kind, 'video');
  assert.equal(detectFromBuffer(pad(Buffer.concat([Buffer.from('\0\0\0\x18'), Buffer.from('ftypM4A ')])))?.kind, 'audio');
  assert.equal(detectFromBuffer(pad(bytes(0x1a, 0x45, 0xdf, 0xa3)))?.mime, 'video/webm');
  assert.equal(detectFromBuffer(pad(Buffer.from('ID3\x03\0\0\0\0\0\0')))?.mime, 'audio/mpeg');
  assert.equal(detectFromBuffer(pad(Buffer.from('OggS\0\x02\0\0')))?.mime, 'audio/ogg');
});

test('scripts, markup and executables are refused even with a media name or type', () => {
  for (const text of ['<script>alert(1)</script>', '<html><body>x</body></html>', '<svg onload="alert(1)"></svg>', '<?php system($_GET["c"]); ?>', '#!/bin/sh\nrm -rf /', 'MZ\x90\0\x03\0\0\0 executable-bytes']) {
    assert.equal(detectFromBuffer(pad(Buffer.from(text))), null, text);
  }
  assert.equal(detectFromBuffer(Buffer.from('tiny')), null);
});

test('every upload route verifies content, and uploads are served as media only', () => {
  const routes = ['routes/users.js', 'routes/audio.js', 'routes/messages.js', 'routes/stories.js', 'routes/posts.js'];
  for (const file of routes) {
    const source = read(`src/${file}`);
    const uploads = source.match(/upload(?:Session)?\.|Upload\.|\.(?:single|array|fields)\(/g) || [];
    assert.ok(uploads.length > 0, file);
    assert.ok(source.includes('verifyUploads('), `${file} must verify uploaded content`);
  }
  const server = read('src/server.js');
  assert.match(server, /X-Content-Type-Options', 'nosniff'/);
  assert.match(server, /Content-Security-Policy', "default-src 'none'; sandbox"/);
});
