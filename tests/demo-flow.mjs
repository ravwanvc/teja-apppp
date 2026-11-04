import assert from "node:assert/strict";
import {
  load,
  data,
  auth,
  image,
  call,
  db,
  product,
  sellerCookie,
  buyer,
} from "./real-flows.mjs";
import { sendOtp, consumeOtp } from "../lib/otp.js";
import { inspectImage } from "../lib/image-review.js";
import { catalog } from "../lib/catalog.js";
import { MIN_CHECKOUT_WINDOW_MS } from "../lib/commerce.js";
const env = globalThis.testEnv;
env.PAYMENTS_MODE = "mock";
env.SMS_MODE = "mock";
const login = await call(auth, {
  action: "login",
  phone: "+998901234567",
  password: "correct-password-123",
});
const buyerCookie = login.headers.get("set-cookie").split(";")[0];
globalThis.reqHeaders.set("cookie", buyerCookie);
const cards = await import(await load("app/api/cards/route.js")),
  mock = await import(await load("app/api/payments/mock/route.js")),
  notifications = await import(await load("app/api/notifications/route.js")),
  account = await import(await load("app/api/account/route.js"));
// Any network call in mock mode is a test failure, including when real-looking credentials exist.
const fetchBefore = globalThis.fetch;
globalThis.fetch = () => {
  throw Error("MOCK MUST NOT FETCH");
};
for (const brand of ["uzcard", "humo", "visa"])
  assert.equal(
    (
      await call(cards, {
        action: "add",
        brand,
        last4: "1234",
        expiry: "12/30",
      })
    ).status,
    200,
  );
assert.equal(
  (
    await call(cards, {
      action: "add",
      brand: "visa",
      last4: "1234",
      expiry: "12/30",
      cvv: "123",
    })
  ).status,
  400,
);
const list = (await (await cards.GET()).json()).cards;
assert.equal(list.length, 3);
assert.ok(
  list.every((c) => !c.token && !c.cvv && c.number === "•••• •••• •••• 1234"),
);
let seq = 0;
const checkout = async (method, outcome = "pay") => {
  const id = "mock-order-" + String(++seq).padStart(16, "0");
  const b = {
    action: "checkout",
    id: product,
    qty: 1,
    requestId: id,
    provider: method,
    cardId: list[0].id,
    acceptTerms: true,
  };
  const r = await call(data, b);
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  assert.match((await r.json()).redirect, /mock-payment/);
  assert.equal((await call(data, { ...b })).status, 200);
  const result = await call(mock, { id, outcome });
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()));
  return id;
};
const initial = db
  .prepare("SELECT stock FROM products WHERE id=?")
  .get(product).stock;
for (const method of ["click", "payme", "card"]) {
  const id = await checkout(method);
  let o = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
  assert.equal(o.payment_state, "test");
  assert.equal(o.is_mock, 1);
  assert.ok(o.receipt_no);
  assert.equal(o.mock_method, method);
  assert.equal((await call(mock, { id, outcome: "pay" })).status, 200);
  const receipt = await import(await load("app/api/receipt/route.js"));
  let html = await (
    await receipt.GET(new Request("https://test.local/api/receipt?id=" + id))
  ).text();
  assert.match(html, /SINOV/);
  assert.ok(html.includes(o.code));
  globalThis.reqHeaders.set("cookie", sellerCookie);
  html = await (
    await receipt.GET(new Request("https://test.local/api/receipt?id=" + id))
  ).text();
  assert.ok(!html.includes(o.code));
  assert.equal((await call(mock, { id, outcome: "pay" })).status, 400);
  const sellerOrders = (await (await data.GET()).json()).orders;
  assert.equal(
    sellerOrders.find((x) => x.id === id).buyerPhone,
    "+998901234567",
  );
  assert.equal((await call(data, { action: "cancel", id })).status, 200);
  assert.equal(
    db.prepare("SELECT payment_state FROM orders WHERE id=?").get(id)
      .payment_state,
    "refunded",
  );
  globalThis.reqHeaders.set("cookie", buyerCookie);
}
for (const outcome of ["reject", "expire"]) {
  const id = await checkout("payme", outcome);
  assert.equal((await call(mock, { id, outcome: "pay" })).status, 400);
}
assert.equal(
  db.prepare("SELECT stock FROM products WHERE id=?").get(product).stock,
  initial,
);
const delivered = await checkout("click");
const code = db
  .prepare("SELECT code FROM orders WHERE id=?")
  .get(delivered).code;
assert.equal((await call(account, { confirm: "DELETE" })).status, 409);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal(
  (await call(data, { action: "collect", id: delivered, code: "WRONG123" }))
    .status,
  400,
);
assert.equal(
  (await call(data, { action: "collect", id: delivered, code })).status,
  200,
);
globalThis.reqHeaders.set("cookie", buyerCookie);
assert.equal(
  (
    await call(data, {
      action: "review",
      id: delivered,
      rating: 5,
      comment: "Sinov sharhi",
    })
  ).status,
  200,
);
const inbox = (await (await notifications.GET()).json()).notifications;
assert.ok(inbox.some((n) => n.kind === "paid"));
assert.ok(inbox.some((n) => n.kind === "refunded"));
assert.ok(inbox.some((n) => n.kind === "collected"));
await call(notifications, { all: true });
assert.ok(
  (await (await notifications.GET()).json()).notifications.every(
    (n) => n.read_at,
  ),
);
const before = db
  .prepare("SELECT phone_verified FROM app_accounts WHERE owner=?")
  .get(buyer);
db.prepare("UPDATE app_accounts SET phone_verified=0 WHERE owner=?").run(buyer);
assert.equal((await call(data, { action: "checkout" })).status, 403);
db.prepare("UPDATE app_accounts SET phone_verified=? WHERE owner=?").run(
  before.phone_verified,
  buyer,
);
const phone = "+998909999999";
let sent = await sendOtp(env, phone, "login", 1000000);
assert.match(sent.mockCode, /^\d{6}$/);
assert.ok(
  !db
    .prepare("SELECT hash FROM phone_otps WHERE owner=?")
    .get("login:" + phone)
    .hash.includes(sent.mockCode),
);
await assert.rejects(sendOtp(env, phone, "login", 1000001), /60/);
for (let n = 0; n < 5; n++)
  await assert.rejects(consumeOtp(env, phone, "login", "xxxxxx", 1000010));
await assert.rejects(consumeOtp(env, phone, "login", sent.mockCode, 1000020));
sent = await sendOtp(env, phone, "login", 1060000);
await assert.rejects(consumeOtp(env, phone, "login", sent.mockCode, 1360001));
sent = await sendOtp(env, phone, "login", 1400000);
assert.equal(await consumeOtp(env, phone, "login", "123456", 1400001), true);
await assert.rejects(consumeOtp(env, phone, "login", "123456", 1400002));
assert.equal(
  (await inspectImage(new Uint8Array(12), "image/png", env)).status,
  "approved",
);
assert.equal(
  (
    await inspectImage(new Uint8Array(12), "image/png", {
      PAYMENTS_MODE: "live",
    })
  ).status,
  "pending",
);
const page = await catalog(env.DB, new URLSearchParams("limit=1&page=1"));
assert.equal(page.products.length, 1);
const originalUntil = db
  .prepare("SELECT until FROM products WHERE id=?")
  .get(product).until;
try {
  db.prepare("UPDATE products SET until=? WHERE id=?").run(
    Date.now() + MIN_CHECKOUT_WINDOW_MS - 1000,
    product,
  );
  const available = await catalog(
    env.DB,
    new URLSearchParams("limit=60&includeSoldOut=1"),
  );
  assert.ok(
    !available.products.some((p) => p.id === product),
    "offers with less than ten minutes left are hidden from buyers",
  );
} finally {
  db.prepare("UPDATE products SET until=? WHERE id=?").run(
    originalUntil,
    product,
  );
}
assert.equal(page.limit, 1);
assert.equal(
  (await catalog(env.DB, new URLSearchParams("q=impossible%25&limit=999")))
    .products.length,
  0,
);
// Stock guard survives parallel attempts for the final item.
db.prepare("UPDATE products SET stock=1 WHERE id=?").run(product);
const attempts = await Promise.all(
  ["a", "b"].map((x) =>
    call(data, {
      action: "checkout",
      id: product,
      qty: 1,
      provider: "payme",
      acceptTerms: true,
      requestId: "concurrent-order-" + x,
    }),
  ),
);
assert.equal(attempts.filter((r) => r.status === 200).length, 1);
assert.equal(
  db.prepare("SELECT stock FROM products WHERE id=?").get(product).stock,
  0,
);
const pending = db
  .prepare("SELECT id FROM orders WHERE id LIKE 'concurrent-order-%'")
  .get().id;
await call(mock, { id: pending, outcome: "reject" });
// A separate account can export/delete; deleted session cannot mutate.
const register = await call(auth, {
  action: "register",
  phone: "+998909876543",
  password: "abcdefgh",
  name: "Disposable",
  role: "member",
});
assert.equal(register.status, 200);
globalThis.reqHeaders.set(
  "cookie",
  register.headers.get("set-cookie").split(";")[0],
);
assert.equal((await account.GET()).status, 200);
assert.equal((await call(account, { confirm: "DELETE" })).status, 200);
assert.equal(
  (await call(data, { action: "favorite", id: product, saved: true })).status,
  401,
);
globalThis.fetch = fetchBefore;
console.log(
  "PASS: mock Click/Payme/card signed callback paths, no network, replay, IDOR, receipts, refund, notifications, OTP expiry/cooldown/attempts, verified gate, moderation, pagination, competing stock, export/delete",
);
