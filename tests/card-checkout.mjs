import assert from "node:assert/strict";
import {
  load,
  D1,
  db,
  data,
  auth,
  product,
  buyer,
  seller,
  sellerCookie,
  call,
} from "./real-flows.mjs";
import { phoneNumber, passwordHash } from "../lib/password.js";
const { expireOrders } = await import("../lib/commerce.js");
const status = await import(await load("app/api/payments/card/route.js"));
const logged = await call(auth, {
  action: "login",
  phone: "+998901234567",
  password: "correct-password-123",
});
assert.equal(logged.status, 200);
const cookie = logged.headers.get("set-cookie").split(";")[0];
globalThis.reqHeaders.set("cookie", cookie);
assert.equal(phoneNumber("998856538"), "+998998856538");
assert.equal(phoneNumber("+998 99 885 65 38"), "+998998856538");
const env = globalThis.testEnv;
env.SUBSCRIBE_PAYMENTS_READY = "true";
const card = db
  .prepare("SELECT id FROM saved_cards WHERE owner=?")
  .get(buyer).id;
db.prepare("UPDATE products SET stock=50,until=? WHERE id=?").run(
  Date.now() + 86400000,
  product,
);
const receipts = new Map();
let pays = 0,
  creates = 0,
  mode = "success";
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const { method, params } = JSON.parse(opts.body);
  assert.match(opts.headers["X-Auth"], /^sub:/);
  if (method === "cards.check")
    return Response.json({
      result: { card: { verify: true, recurrent: true } },
    });
  if (method === "receipts.create") {
    creates++;
    const r = {
      _id: "provider-receipt-" + creates,
      amount: params.amount,
      account: [{ name: "order_id", value: params.account.order_id }],
      merchant: { _id: "sub" },
      state: 0,
      currency: 860,
    };
    receipts.set(r._id, r);
    return Response.json({ result: { receipt: r } });
  }
  if (method === "receipts.pay") {
    pays++;
    const r = receipts.get(params.id);
    r.state = 4;
    r.pay_time = Date.now();
    if (mode === "timeout") throw Error("network timeout");
    if (mode === "mismatch")
      return Response.json({
        result: { receipt: { ...r, amount: r.amount + 1 } },
      });
    return Response.json({ result: { receipt: r } });
  }
  if (method === "receipts.get")
    return Response.json({ result: { receipt: receipts.get(params.id) } });
  throw Error(method);
};
const checkout = (id, cardId = card, extra = {}) =>
  call(data, {
    action: "checkout",
    provider: "card",
    id: product,
    qty: 2,
    requestId: id,
    cardId,
    acceptTerms: true,
    ...extra,
  });
let r = await checkout("card-purchase-000001", "foreign-card");
assert.equal(r.status, 400);
assert.equal(
  db.prepare("SELECT stock FROM products WHERE id=?").get(product).stock,
  50,
);
assert.equal(creates, 0);
r = await checkout("card-purchase-000001");
assert.equal(r.status, 200);
assert.equal((await r.json()).cardPayment, "paid");
let order = db
  .prepare("SELECT * FROM orders WHERE id=?")
  .get("card-purchase-000001");
assert.equal(order.deposit, 200);
assert.equal(order.payment_state, "paid");
assert.ok(order.receipt_no > 0);
assert.equal(pays, 1);
assert.equal(
  db.prepare("SELECT stock FROM products WHERE id=?").get(product).stock,
  48,
);
const no = order.receipt_no;
await checkout(order.id);
assert.equal(pays, 1);
assert.equal(
  db.prepare("SELECT receipt_no FROM orders WHERE id=?").get(order.id)
    .receipt_no,
  no,
);
mode = "timeout";
r = await checkout("card-purchase-000002");
assert.equal((await r.json()).cardPayment, "pending");
assert.equal(pays, 2);
db.prepare("UPDATE orders SET hold_until=? WHERE id=?").run(
  Date.now() - 1000,
  "card-purchase-000002",
);
await expireOrders(D1);
assert.equal(
  db.prepare("SELECT status FROM orders WHERE id=?").get("card-purchase-000002")
    .status,
  "pending_payment",
);
assert.equal(
  (await call(data, { action: "cancel", id: "card-purchase-000002" })).status,
  400,
);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal((await call(status, { id: "card-purchase-000002" })).status, 400);
globalThis.reqHeaders.set("cookie", cookie);
assert.equal(
  (await (await call(status, { id: "card-purchase-000002" })).json())
    .cardPayment,
  "paid",
);
assert.equal(pays, 2);
mode = "mismatch";
r = await checkout("card-purchase-000003");
assert.equal((await r.json()).cardPayment, "pending");
assert.equal(
  db
    .prepare("SELECT receipt_no FROM orders WHERE id=?")
    .get("card-purchase-000003").receipt_no,
  null,
);
assert.equal(
  (await (await call(status, { id: "card-purchase-000003" })).json())
    .cardPayment,
  "paid",
);
assert.equal(pays, 3);
mode = "timeout";
await checkout("card-purchase-000004");
const rc = db
  .prepare("SELECT receipt_id FROM card_charges WHERE order_id=?")
  .get("card-purchase-000004");
receipts.get(rc.receipt_id).state = 50;
const stockBefore = db
  .prepare("SELECT stock FROM products WHERE id=?")
  .get(product).stock;
assert.equal(
  (await (await call(status, { id: "card-purchase-000004" })).json())
    .cardPayment,
  "failed",
);
await call(status, { id: "card-purchase-000004" });
assert.equal(
  db.prepare("SELECT stock FROM products WHERE id=?").get(product).stock,
  stockBefore + 2,
);
await checkout("card-purchase-000005");
db.prepare("UPDATE products SET until=? WHERE id=?").run(
  Date.now() - 100,
  product,
);
assert.equal(
  (await (await call(status, { id: "card-purchase-000005" })).json())
    .cardPayment,
  "paid",
);
order = db
  .prepare("SELECT * FROM orders WHERE id=?")
  .get("card-purchase-000005");
assert.equal(order.status, "cancelled");
assert.equal(order.payment_state, "refund_due");
assert.ok(order.receipt_no);
// SQL CAS remains single winner under concurrent local requests.
db.prepare("UPDATE products SET until=? WHERE id=?").run(
  Date.now() + 86400000,
  product,
);
mode = "success";
const before = pays;
await Promise.all([
  checkout("card-purchase-000006"),
  checkout("card-purchase-000006"),
]);
assert.equal(pays, before + 1);
assert.equal(
  db
    .prepare("SELECT COUNT(*) n FROM orders WHERE id=?")
    .get("card-purchase-000006").n,
  1,
);
// Normal login can route the configured admin; a wrong password never does.
env.ADMIN_PHONE = "+998998856538";
env.ADMIN_PASSWORD_HASH = await passwordHash("test-admin-pass-123");
r = await call(auth, {
  action: "login",
  phone: "+998998856538",
  password: "wrong-password-123",
});
assert.equal(r.status, 401);
r = await call(auth, {
  action: "login",
  phone: "+998998856538",
  password: "test-admin-pass-123",
});
assert.equal((await r.json()).redirect, "/admin");
globalThis.fetch = realFetch;
console.log(
  "PASS: card ownership, exact 10%, one charge and receipt, concurrent retry, uncertain timeout holds, verified reconciliation, mismatched amount rejection, cancellation, late refund queue and admin unified login. Provider mocked.",
);
