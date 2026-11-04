import assert from 'node:assert/strict';
import {
  storageAdapter,
  initializeMongoDatabase,
  mongoIndexDefinitions,
  supportsMongoTransactions,
} from '../lib/mongodb.js';

function fakeDatabase(failOn) {
  const calls = [];
  return {
    calls,
    failOn,
    collection(name) {
      return {
        async createIndex(keys, options) {
          calls.push({ name, keys, options });
          if (this.db.failOn && calls.length === this.db.failOn) {
            this.db.failOn = 0;
            throw new Error('index creation failed');
          }
          return `${name}_${calls.length}`;
        },
        db: this,
      };
    },
  };
}

const db = fakeDatabase();
const [first, second] = await Promise.all([
  initializeMongoDatabase(db),
  initializeMongoDatabase(db),
]);
assert.equal(first, db);
assert.equal(second, db);
assert.equal(
  db.calls.length,
  Object.values(mongoIndexDefinitions).reduce((count, indexes) => count + indexes.length, 0),
);
await initializeMongoDatabase(db);
assert.equal(db.calls.length, Object.values(mongoIndexDefinitions).reduce((count, indexes) => count + indexes.length, 0));

const retryDb = fakeDatabase(1);
await assert.rejects(initializeMongoDatabase(retryDb), /index creation failed/);
retryDb.calls.length = 0;
await initializeMongoDatabase(retryDb);
assert.equal(
  retryDb.calls.length,
  Object.values(mongoIndexDefinitions).reduce((count, indexes) => count + indexes.length, 0),
);
assert.equal(supportsMongoTransactions({ setName: 'rs0' }), true);
assert.equal(supportsMongoTransactions({ msg: 'isdbgrid' }), true);
assert.equal(supportsMongoTransactions({}), false);

const stored = new Map();
const storageDb = {
  collection(name) {
    assert.equal(name, 'uploaded_files');
    return {
      async updateOne(filter, update) {
        stored.set(filter.key, update.$set);
      },
      async findOne(filter) {
        return stored.get(filter.key) || null;
      },
      async deleteOne(filter) {
        stored.delete(filter.key);
      },
    };
  },
};
const bucket = storageAdapter(async () => storageDb);
const original = Uint8Array.from([0, 1, 2, 255]);
await bucket.put('test/image', original, {
  httpMetadata: { contentType: 'image/png' },
});
const image = await bucket.get('test/image');
assert.deepEqual([...image.body], [...original]);
assert.equal(image.httpMetadata.contentType, 'image/png');
assert.equal(await bucket.head('test/image'), true);
await assert.rejects(
  bucket.put('test/large', Buffer.alloc(2_000_001)),
  /2 MB/,
);
await bucket.delete('test/image');
assert.equal(await bucket.get('test/image'), null);
assert.equal(await bucket.head('test/image'), false);

console.log('PASS: MongoDB indexes, transaction-topology detection, and binary storage are verified.');
