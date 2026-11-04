import { MongoClient } from 'mongodb';

const INDEXES = {
  geo: [[{ key: 1 }, { unique: true }]],
  users: [[{ id: 1 }, { unique: true }]],
  products: [[{ id: 1 }, { unique: true }], [{ owner: 1, active: 1, until: 1 }], [{ city: 1, category: 1, active: 1, until: 1 }]],
  orders: [[{ id: 1 }, { unique: true }], [{ transaction_id: 1 }, { unique: true, partialFilterExpression: { transaction_id: { $type: 'string' } } }], [{ buyer: 1, created: -1 }], [{ product: 1, status: 1 }], [{ status: 1, pickup_at: 1 }]],
  receipt_counters: [[{ kind: 1 }, { unique: true }]],
  app_accounts: [[{ owner: 1 }, { unique: true }], [{ phone: 1 }, { unique: true }]],
  app_admin: [[{ id: 1 }, { unique: true }]],
  app_sessions: [[{ token: 1 }, { unique: true }], [{ owner: 1, expires: 1 }]],
  mobile_sessions: [[{ access_hash: 1 }, { unique: true }], [{ refresh_hash: 1 }, { unique: true }], [{ owner: 1, access_expires: 1 }]],
  auth_limits: [[{ key: 1 }, { unique: true }], [{ expires: 1 }]],
  phone_otps: [[{ owner: 1 }, { unique: true }], [{ expires: 1 }]],
  payment_transactions: [[{ id: 1 }, { unique: true }], [{ order_id: 1 }, { unique: true }]],
  saved_cards: [[{ id: 1 }, { unique: true }], [{ token: 1 }, { unique: true }], [{ owner: 1, created: -1 }]],
  card_charges: [[{ order_id: 1 }, { unique: true }], [{ receipt_id: 1 }, { unique: true, partialFilterExpression: { receipt_id: { $type: 'string' } } }], [{ order_id: 1, status: 1 }]],
  demo_wallet: [[{ id: 1 }, { unique: true }]],
  image_checks: [[{ key: 1 }, { unique: true }]],
  favorites: [[{ user: 1, product: 1 }, { unique: true }], [{ user: 1, created: -1 }]],
  reviews: [[{ order_id: 1 }, { unique: true }], [{ product: 1, hidden: 1, created: -1 }], [{ buyer: 1, created: -1 }]],
  stock_events: [[{ id: 1 }, { unique: true }], [{ product: 1, created: -1 }]],
  listing_drafts: [[{ owner: 1, updated: -1 }]],
  notifications: [[{ id: 1 }, { unique: true }], [{ owner: 1, kind: 1, entity: 1 }, { unique: true, partialFilterExpression: { entity: { $type: 'string' } } }], [{ owner: 1, created: -1 }]],
  reports: [[{ id: 1 }, { unique: true }], [{ status: 1, created: -1 }]],
  cities: [[{ name: 1 }, { unique: true }]],
  change_version: [[{ id: 1 }, { unique: true }]],
  deletion_jobs: [[{ key: 1 }, { unique: true }]],
  password_resets: [[{ token: 1 }, { unique: true }], [{ expires: 1 }]],
  recovery_codes: [[{ owner: 1 }, { unique: true }]],
  quality_claims: [[{ order_id: 1 }, { unique: true }]],
  shop_follows: [[{ owner: 1, seller: 1 }, { unique: true }]],
  waitlist: [[{ owner: 1, product: 1 }, { unique: true }]],
  partner_businesses: [[{ id: 1 }, { unique: true }], [{ owner: 1 }, { unique: true }]],
  partner_ledger: [[{ id: 1 }, { unique: true }], [{ kind: 1, order_id: 1 }, { unique: true, partialFilterExpression: { order_id: { $type: 'string' } } }], [{ partner_id: 1, created: -1 }]],
  admin_events: [[{ id: 1 }, { unique: true }]],
  refund_records: [[{ order_id: 1 }, { unique: true }]],
  reminder_preferences: [[{ owner: 1 }, { unique: true }]],
  reminder_deliveries: [[{ order_id: 1 }, { unique: true }]],
  uploaded_files: [[{ key: 1 }, { unique: true }]],
};

const cacheKey = Symbol.for('teja.mongodb.client');
const indexPromises = new WeakMap();

export function getMongoClient(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw Object.assign(new Error('MONGODB_URI sozlanmagan. .env faylga MongoDB ulanish manzilini kiriting.'), {
      code: 'MONGODB_NOT_CONFIGURED',
    });
  }
  const cached = globalThis[cacheKey];
  if (cached?.uri === uri) return cached.promise;

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });
  const promise = client.connect().catch((error) => {
    if (globalThis[cacheKey]?.promise === promise) delete globalThis[cacheKey];
    throw error;
  });
  globalThis[cacheKey] = { uri, promise };
  return promise;
}

export async function initializeMongoDatabase(db) {
  if (!indexPromises.has(db)) {
    const promise = (async () => {
      await Promise.all(
        Object.entries(INDEXES).flatMap(([collection, indexes]) =>
          indexes.map(([keys, options]) =>
            db.collection(collection).createIndex(keys, options),
          ),
        ),
      );
      await db.collection("cities").updateOne(
        { name: "Toshkent" },
        { $setOnInsert: { name: "Toshkent", lat: 41.31, lng: 69.28 } },
        { upsert: true },
      );
    })().catch((error) => {
      indexPromises.delete(db);
      throw error;
    });
    indexPromises.set(db, promise);
  }
  await indexPromises.get(db);
  return db;
}

export async function getMongoDb() {
  const client = await getMongoClient();
  return initializeMongoDatabase(client.db());
}

export function supportsMongoTransactions(topology) {
  return Boolean(topology?.setName) || topology?.msg === "isdbgrid";
}

export async function checkMongoConnection() {
  const db = await getMongoDb();
  await db.command({ ping: 1 });
  const topology = await db.command({ hello: 1 });
  const transactionsSupported = supportsMongoTransactions(topology);
  return {
    ok: transactionsSupported,
    database: db.databaseName,
    transactionsSupported,
  };
}

export function storageAdapter(getDb = getMongoDb) {
  return {
    async put(key, bytes, options = {}) {
      const body = Buffer.from(bytes);
      if (body.length > 2_000_000)
        throw new Error("Rasm 2 MB dan kichik bo‘lsin");
      const db = await getDb();
      await db.collection("uploaded_files").updateOne(
        { key },
        {
          $set: {
            key,
            content_type:
              options.httpMetadata?.contentType || "application/octet-stream",
            body,
            created: Date.now(),
          },
        },
        { upsert: true },
      );
    },
    async get(key) {
      const db = await getDb();
      const row = await db
        .collection("uploaded_files")
        .findOne({ key }, { projection: { content_type: 1, body: 1 } });
      if (!row) return null;
      const body = row.body;
      const bytes = Buffer.isBuffer(body)
        ? body
        : body?.buffer && Buffer.isBuffer(body.buffer)
          ? body.buffer.subarray(0, body.position ?? body.buffer.length)
          : Buffer.from(body);
      return {
        body: new Uint8Array(bytes),
        httpMetadata: { contentType: row.content_type },
      };
    },
    async head(key) {
      const db = await getDb();
      return !!(await db
        .collection("uploaded_files")
        .findOne({ key }, { projection: { _id: 1 } }));
    },
    async delete(key) {
      const db = await getDb();
      await db.collection("uploaded_files").deleteOne({ key });
    },
  };
}

export const BUCKET = storageAdapter();

export const mongoIndexDefinitions = INDEXES;
