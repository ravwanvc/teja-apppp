import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const db = new DatabaseSync(":memory:");
for (const name of (await fs.readdir("drizzle"))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  db.exec(await fs.readFile("drizzle/" + name, "utf8"));
const objects = new Map();
const D1 = {
  prepare(sql) {
    let args = [];
    return {
      bind(...a) {
        args = a;
        return this;
      },
      async first() {
        return db.prepare(sql).get(...args) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args) };
      },
      async run() {
        return { meta: { changes: db.prepare(sql).run(...args).changes } };
      },
    };
  },
  async batch(statements) {
    db.exec("BEGIN");
    try {
      const result = [];
      for (const s of statements) result.push(await s.run());
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  },
};
globalThis.testEnv = {
  PAYMENTS_MODE: "live",
  SMS_MODE: "mock",
  SMS_REQUIRED: "true",
  DB: D1,
  BUCKET: {
    async put(k, b, opts) {
      objects.set(k, { body: b, ...opts });
    },
    async head(k) {
      return objects.has(k);
    },
    async get(k) {
      return objects.get(k);
    },
  },
};
globalThis.reqHeaders = new Headers();
const cache = new Map();
async function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  let code = await fs.readFile(file, "utf8");
  code = code
    .replace(
      /import \{\s*env\s*\} from ['"](?:cloudflare:workers|[^'"]*runtime-env\.js)['"];?/g,
      "const env=globalThis.testEnv;",
    )
    .replace(
      /import \{\s*headers\s*\} from ['"]next\/headers['"];?/g,
      "const headers=async()=>globalThis.reqHeaders;",
    );
  for (const m of [...code.matchAll(/from ['"](\.\.?\/[^'"]+)['"]/g)]) {
    const resolved = path.resolve(path.dirname(file), m[1]);
    const u = await load(resolved);
    code = code.replace(m[0], "from '" + u + "'");
  }
  const uri =
    "data:text/javascript;base64," + Buffer.from(code).toString("base64");
  cache.set(file, uri);
  return uri;
}
const auth = await import(await load("app/api/auth/route.js")),
  authLib = await import(await load("lib/auth.js")),
  data = await import(await load("app/api/data/route.js")),
  image = await import(await load("app/api/image/route.js")),
  cards = await import(await load("app/api/cards/route.js")),
  phone = await import(await load("app/api/phone/route.js"));
const { passwordHash } = await import("../lib/password.js");
const { paymeCallback, clickCallback, clickSignature, paymentUrl } =
  await import("../lib/payments.js");
const request = (body, origin = "https://test.local") =>
  new Request("https://test.local/api/test", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const { sendOtp } = await import("../lib/otp.js");
const call = async (mod, b, origin) => {
  if (
    mod === auth &&
    ["register", "login", "reset", "otpLogin"].includes(b.action) &&
    origin !== "https://evil.local" &&
    b.phone
  ) {
    await D1.prepare("DELETE FROM phone_otps WHERE owner=?")
      .bind((b.action === "register" ? "register" : "login") + ":" + b.phone)
      .run();
    await sendOtp(
      globalThis.testEnv,
      b.phone,
      b.action === "register" ? "register" : "login",
    );
    b = { ...b, code: "123456" };
  }
  if (mod === auth && b.action === "admin") b = { ...b, code: "123456" };
  return mod.POST(request(b, origin));
};
assert.equal(
  (await call(auth, { action: "login" }, "https://evil.local")).status,
  403,
);
assert.equal((await call(data, { action: "create" })).status, 401);
let response = await call(auth, {
  action: "register",
  phone: "+998901234567",
  password: "correct-password-123",
  name: "Buyer",
  role: "admin",
});
assert.equal(response.status, 400);
response = await call(auth, {
  action: "register",
  phone: "+998901234567",
  password: "correct-password-123",
  name: "Buyer",
  role: "member",
});
assert.equal(response.status, 200);
const buyerCookie = response.headers.get("set-cookie").split(";")[0];
assert.match(
  response.headers.get("set-cookie"),
  /HttpOnly; Secure; SameSite=Lax/,
);
globalThis.reqHeaders.set("cookie", buyerCookie);
const buyer = (await authLib.getAppUser()).userId;
assert.equal(
  db.prepare("SELECT role FROM users WHERE id=?").get(buyer).role,
  "member",
);
assert.equal(
  (
    await call(auth, {
      action: "login",
      phone: "+998901234567",
      password: "incorrect-password-123",
    })
  ).status,
  401,
);
assert.equal(
  (
    await call(auth, {
      action: "register",
      phone: "+998901234567",
      password: "correct-password-123",
      name: "Other",
      role: "member",
    })
  ).status,
  409,
);
assert.equal((await call(data, { action: "demoCheckout" })).status, 410);
assert.equal((await call(cards, { action: "add", token: "no" })).status, 503);
assert.equal((await call(phone, { action: "send" })).status, 200);
const buyerHash = db
  .prepare("SELECT password_hash FROM app_accounts")
  .get().password_hash;
assert.ok(!buyerHash.includes("correct-password"));
response = await call(auth, {
  action: "register",
  phone: "+998901234568",
  password: "seller-password-123",
  name: "Seller",
  role: "seller",
});
const sellerCookie = response.headers.get("set-cookie").split(";")[0];
globalThis.reqHeaders.set("cookie", sellerCookie);
const seller = (await authLib.getAppUser()).userId;
const fd = new FormData();
fd.set(
  "file",
  new File(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZncAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    "a.png",
    { type: "image/png" },
  ),
);
globalThis.testEnv.PAYMENTS_MODE = "mock";
const upload = await image.POST(
  new Request("https://test.local/api/image", {
    method: "POST",
    headers: { origin: "https://test.local" },
    body: fd,
  }),
);
globalThis.testEnv.PAYMENTS_MODE = "live";
assert.equal(upload.status, 200);
const { url } = await upload.json();
response = await call(data, {
  action: "create",
  product: {
    title: "bread",
    shop: "Bakery",
    category: "Non",
    image: url,
    price: 1000,
    original: 2000,
    stock: 8,
    address: "Tashkent",
    lat: 41,
    lng: 69,
    allergens: "Wheat",
    storage: "Cool",
    until: Date.now() + 86400000,
  },
});
assert.equal(response.status, 200);
const product = (await response.json()).id;
assert.equal(
  db.prepare("SELECT title,active FROM products").get().title,
  "Bread",
);
assert.equal(
  (await call(data, { action: "reviewImage", id: product, approved: true }))
    .status,
  403,
);
globalThis.testEnv.ADMIN_PHONE = "+998901234569";
globalThis.testEnv.ADMIN_PASSWORD_HASH =
  await passwordHash("admin-password-123");
response = await call(auth, {
  action: "admin",
  phone: "+998901234569",
  password: "admin-password-123",
});
assert.equal(response.status, 200);
const adminCookie = response.headers.get("set-cookie").split(";")[0];
globalThis.reqHeaders.set("cookie", adminCookie);
assert.equal((await authLib.getAppUser()).role, "admin");
assert.equal(
  (await call(data, { action: "reviewImage", id: product, approved: true }))
    .status,
  200,
);
globalThis.reqHeaders.set("cookie", buyerCookie);
const checkout = (id, provider = "payme") =>
  call(data, {
    action: "checkout",
    id: product,
    qty: 1,
    requestId: id,
    provider,
    acceptTerms: true,
  });
assert.equal((await checkout("order-unconfigured-000")).status, 503);
assert.equal(db.prepare("SELECT stock FROM products").get().stock, 8);
Object.assign(globalThis.testEnv, {
  PAYME_MERCHANT_ID: "merchant",
  PAYME_MERCHANT_KEY: "secret",
  PAYMENT_CALLBACKS_READY: "true",
  CLICK_MERCHANT_ID: "123",
  CLICK_SERVICE_ID: "456",
  CLICK_SECRET_KEY: "click-secret",
});
const env = globalThis.testEnv;
const payAuth = "Basic " + btoa("Paycom:secret");
const rpc = (method, params, authorization = payAuth) =>
  paymeCallback(D1, env, authorization, { id: 1, method, params });
const oid = "order-real-0000000001";
response = await checkout(oid);
assert.equal(response.status, 200);
assert.ok(
  (await response.json()).redirect.startsWith("https://checkout.paycom.uz/"),
);
assert.equal((await checkout(oid)).status, 200);
assert.equal(db.prepare("SELECT stock FROM products").get().stock, 7);
assert.equal(
  (
    await rpc(
      "CheckPerformTransaction",
      { amount: 10000, account: { order_id: oid } },
      "Basic bad",
    )
  ).error.code,
  -32504,
);
assert.equal(
  (
    await rpc("CheckPerformTransaction", {
      amount: 9999,
      account: { order_id: oid },
    })
  ).error.code,
  -31001,
);
assert.equal(
  (
    await rpc("CheckPerformTransaction", {
      amount: 10000,
      account: { order_id: oid },
    })
  ).result.allow,
  true,
);
const params = {
  id: "external1",
  time: Date.now(),
  amount: 10000,
  account: { order_id: oid },
};
assert.equal((await rpc("CreateTransaction", params)).result.state, 1);
assert.equal((await rpc("CreateTransaction", params)).result.state, 1);
assert.equal(
  (await rpc("PerformTransaction", { id: "external1" })).result.state,
  2,
);
assert.equal(
  (await rpc("PerformTransaction", { id: "external1" })).result.state,
  2,
);
let order = db.prepare("SELECT * FROM orders WHERE id=?").get(oid);
assert.equal(order.receipt_no, 1);
assert.equal(order.payment_state, "paid");
assert.equal(db.prepare("SELECT stock FROM products").get().stock, 7);
assert.equal(
  (
    await call(data, {
      action: "schedule",
      id: oid,
      pickupAt: Date.now() + 600000,
    })
  ).status,
  200,
);
assert.equal(
  (
    await call(data, {
      action: "schedule",
      id: oid,
      pickupAt: Date.now() + 600000,
    })
  ).status,
  400,
);
assert.equal(
  (await rpc("CancelTransaction", { id: "external1", reason: 1 })).result.state,
  -2,
);
assert.equal(
  (await rpc("CancelTransaction", { id: "external1", reason: 1 })).result.state,
  -2,
);
assert.equal(db.prepare("SELECT stock FROM products").get().stock, 8);
assert.equal(
  db.prepare("SELECT payment_state FROM orders WHERE id=?").get(oid)
    .payment_state,
  "refunded",
);
const cid = "order-click-000000001";
await checkout(cid, "click");
let cp = {
  click_trans_id: "123456",
  service_id: "456",
  merchant_trans_id: cid,
  amount: "100.00",
  action: "0",
  error: "0",
  sign_time: "2026-10-25 10:00:00",
};
const click = (p) =>
  clickCallback(D1, env, { ...p, sign_string: clickSignature(env, p) });
assert.equal(
  (await clickCallback(D1, env, { ...cp, sign_string: "bad" })).error,
  -1,
);
assert.equal((await click(cp)).error, 0);
cp = { ...cp, action: "1", merchant_prepare_id: "123456" };
assert.equal((await click(cp)).error, 0);
assert.equal((await click(cp)).error, 0);
order = db.prepare("SELECT * FROM orders WHERE id=?").get(cid);
assert.equal(order.receipt_no, 2);
assert.equal(db.prepare("SELECT stock FROM products").get().stock, 7);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal(
  (await call(data, { action: "collect", id: cid, code: order.code })).status,
  200,
);
assert.equal((await click({ ...cp, error: "-9" })).error, -9);
assert.equal(
  db.prepare("SELECT status FROM orders WHERE id=?").get(cid).status,
  "collected",
);
globalThis.reqHeaders.set("cookie", buyerCookie);
const late = "order-late-0000000001";
await checkout(late);
await rpc("CreateTransaction", {
  ...params,
  id: "late",
  account: { order_id: late },
});
db.prepare("UPDATE orders SET hold_until=? WHERE id=?").run(
  Date.now() - 1,
  late,
);
assert.equal(
  (await rpc("PerformTransaction", { id: "late" })).error.code,
  -31008,
);
await data.GET();
await data.GET();
assert.equal(db.prepare("SELECT stock FROM products").get().stock, 7);
const statements = await rpc("GetStatement", {
  from: 0,
  to: Date.now() + 1000,
});
assert.equal(statements.result.transactions.length, 2);
const oldFetch = globalThis.fetch;
Object.assign(env, {
  PAYME_SUBSCRIBE_ID: "sub",
  PAYME_SUBSCRIBE_KEY: "secret",
});
globalThis.fetch = async () =>
  Response.json({
    result: {
      card: {
        verify: false,
        recurrent: true,
        number: "860000******1234",
        expire: "12/29",
      },
    },
  });
assert.equal(
  (await call(cards, { action: "add", token: "long-provider-token-00001" }))
    .status,
  400,
);
assert.equal(
  (await call(cards, { action: "add", number: "8600000000000000" })).status,
  400,
);
globalThis.fetch = async () =>
  Response.json({
    result: {
      card: {
        verify: true,
        recurrent: true,
        number: "860000******1234",
        expire: "12/29",
      },
    },
  });
assert.equal(
  (await call(cards, { action: "add", token: "long-provider-token-00001" }))
    .status,
  200,
);
const cardList = await (await cards.GET()).json();
assert.equal(cardList.cards.length, 1);
assert.equal(cardList.cards[0].token, undefined);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal((await (await cards.GET()).json()).cards.length, 0);
assert.equal(
  (await call(cards, { action: "remove", id: cardList.cards[0].id })).status,
  404,
);
globalThis.reqHeaders.set("cookie", buyerCookie);
env.SMS_MODE = "live";
await D1.prepare("DELETE FROM phone_otps").run();
Object.assign(env, {
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_AUTH_TOKEN: "secret",
  TWILIO_VERIFY_SERVICE_SID: "VAtest",
});
globalThis.fetch = async () =>
  Response.json({ status: "pending", to: "+998901234567" });
await call(phone, { action: "send" });
assert.equal(
  (await call(phone, { action: "verify", code: "123456" })).status,
  400,
);
globalThis.fetch = async () =>
  Response.json({ status: "approved", to: "+998901234568" });
assert.equal(
  (await call(phone, { action: "verify", code: "123456" })).status,
  400,
);
globalThis.fetch = async () =>
  Response.json({ status: "approved", to: "+998901234567" });
assert.equal(
  (await call(phone, { action: "verify", code: "123456" })).status,
  200,
);
globalThis.fetch = oldFetch;
env.SMS_MODE = "mock";
await call(auth, { action: "logout" });
assert.equal(await authLib.getAppUser(), null);
globalThis.reqHeaders.set("cookie", adminCookie);
env.ADMIN_PASSWORD_HASH = await passwordHash("new-admin-password-123");
assert.equal(await authLib.getAppUser(), null);
console.log(
  "PASS: password registration, admin isolation, sessions/logout/rotation, CSRF, image moderation, inventory, Payme/Click authentication, amount checks, replay safety, atomic receipts, cancellation, expiry, bank-token validation, wallet isolation and SMS verification. Provider HTTP responses mocked; no live money/SMS.",
);
export {
  load,
  D1,
  db,
  auth,
  data,
  image,
  product,
  buyerCookie,
  sellerCookie,
  buyer,
  seller,
  request,
  call,
};
