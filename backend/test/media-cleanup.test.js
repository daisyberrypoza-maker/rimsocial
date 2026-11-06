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
  assert.equal(localUploadPath('/uploads/../../.env'), null);
  const target = localUploadPath('/uploads/valid-file.jpg');
  assert.ok(target);
  assert.equal(path.dirname(target), path.resolve('uploads'));
});


const { Post, User, MediaCleanupJob } = require('../src/db');
const cloudinary = require('../src/services/cloudinary');
const { requestAssetCleanup } = require('../src/services/mediaCleanup');
const originalPostCount = Post.count;
const originalUserCount = User.count;
const originalFindOrCreate = MediaCleanupJob.findOrCreate;
const originalDeleteAsset = cloudinary.deleteAsset;

test.afterEach(() => {
  Post.count = originalPostCount;
  User.count = originalUserCount;
  MediaCleanupJob.findOrCreate = originalFindOrCreate;
  cloudinary.deleteAsset = originalDeleteAsset;
});

test('successful asset deletion completes the durable cleanup job', async () => {
  let job;
  Post.count = async () => 0;
  User.count = async () => 0;
  MediaCleanupJob.findOrCreate = async () => {
    job = { status: 'pending', attempts: 0, async update(patch) { Object.assign(this, patch); } };
    return [job, true];
  };
  cloudinary.deleteAsset = async () => ({ result: 'ok' });
  const result = await requestAssetCleanup('test/asset-success', 'image', 'test', { knownUnreferenced: true });
  assert.equal(result.done, true);
  assert.equal(job.status, 'completed');
  assert.equal(job.attempts, 1);
});

test('failed asset deletion remains queued with a retry time and error', async () => {
  let job;
  Post.count = async () => 0;
  User.count = async () => 0;
  MediaCleanupJob.findOrCreate = async () => {
    job = { status: 'pending', attempts: 0, async update(patch) { Object.assign(this, patch); } };
    return [job, true];
  };
  cloudinary.deleteAsset = async () => { throw new Error('simulated Cloudinary outage'); };
  const result = await requestAssetCleanup('test/asset-retry', 'video', 'test', { knownUnreferenced: true });
  assert.equal(result.done, false);
  assert.equal(result.queued, true);
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 1);
  assert.match(job.lastError, /simulated Cloudinary outage/);
  assert.ok(new Date(job.nextAttemptAt).getTime() > Date.now());
});

test('shared assets are never deleted or queued for deletion', async () => {
  let deleteCalls = 0;
  let queueCalls = 0;
  Post.count = async () => 1;
  User.count = async () => 0;
  MediaCleanupJob.findOrCreate = async () => { queueCalls += 1; return [{ status: 'pending', attempts: 0, async update() {} }, true]; };
  cloudinary.deleteAsset = async () => { deleteCalls += 1; };
  const result = await requestAssetCleanup('test/shared-asset', 'image', 'test');
  assert.equal(result.shared, true);
  assert.equal(deleteCalls, 0);
  assert.equal(queueCalls, 0);
});
