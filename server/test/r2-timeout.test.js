// Every call to the bucket is given up on after 15 seconds, so a bucket that stops answering
// cannot hold a request (or a world delete) open for good. S3's send is stood in for and records
// what it was given.
//
//   node --test server/test/r2-timeout.test.js
const test = require('node:test');
const assert = require('node:assert');

Object.assign(process.env, { R2_ACCOUNT_ID: 'acct', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket', R2_PUBLIC_URL: 'https://pub.test' });
const calls = [];
require('@aws-sdk/client-s3').S3Client.prototype.send = async (command, options) => {
  calls.push({ name: command.constructor.name, options });
  return command.constructor.name === 'HeadObjectCommand' ? { ContentLength: 3 } : { Contents: [{ Key: 'worlds/1/a.webp' }], IsTruncated: false };
};
const storage = require('../storage');

test('the wait is 15 seconds', () => {
  assert.strictEqual(storage.R2_TIMEOUT_MS, 15000);
});

test('every kind of call carries its own abort signal, not yet fired', async () => {
  await storage.putObject('worlds/1/a.webp', Buffer.from('x'), 'image/webp');
  await storage.copyObject('worlds/1/a.webp', 'worlds/2/a.webp', 'image/webp');
  await storage.objectSize('worlds/1/a.webp');
  await storage.deleteObject('worlds/1/a.webp');
  await storage.deletePrefix('worlds/1/');
  assert.deepStrictEqual(
    calls.map((c) => c.name),
    ['PutObjectCommand', 'CopyObjectCommand', 'HeadObjectCommand', 'DeleteObjectCommand', 'ListObjectsV2Command', 'DeleteObjectsCommand'],
  );
  const signals = calls.map((c) => c.options?.abortSignal);
  for (const [i, s] of signals.entries()) {
    assert.ok(s instanceof AbortSignal, `${calls[i].name} has a signal`);
    assert.strictEqual(s.aborted, false, `${calls[i].name}: still within its wait`);
  }
  assert.strictEqual(new Set(signals).size, signals.length, 'each call has a clock of its own');
});
