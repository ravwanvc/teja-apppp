import assert from "node:assert/strict";
import {
  load,
  data,
  image,
  call,
  db,
  sellerCookie,
  seller,
  product,
  D1,
} from "./real-flows.mjs";
import { pickupReminders } from "../lib/notifications.js";
const env = globalThis.testEnv;
env.PAYMENTS_MODE = "live";
delete env.GEMINI_API_KEY;
globalThis.reqHeaders.set("cookie", sellerCookie);
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
    "food.png",
    { type: "image/png" },
  ),
);
const response = await image.POST(
  new Request("https://test.local/api/image", {
    method: "POST",
    headers: { origin: "https://test.local" },
    body: fd,
  }),
);
assert.equal(response.status, 200);
const upload = await response.json();
assert.equal(upload.review.status, "pending");
assert.ok(await env.BUCKET.head(upload.url.slice(14)));
const created = await call(data, {
  action: "create",
  requestId: crypto.randomUUID(),
  product: {
    title: "Review food",
    shop: "Store",
    category: "Non",
    image: upload.url,
    price: 1000,
    original: 2000,
    stock: 1,
    address: "Toshkent",
    lat: 41,
    lng: 69,
    until: Date.now() + 86400000,
    allergens: "Un",
    storage: "Salqin",
  },
});
assert.equal(created.status, 200);
const id = (await created.json()).id;
assert.equal(
  db.prepare("SELECT active FROM products WHERE id=?").get(id).active,
  0,
);
assert.equal(
  (await call(data, { action: "reviewImage", id, approved: true })).status,
  403,
);
const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get().id;
// Exercise admin route with a valid fresh session, then approve the saved pending image.
const { digest } = await import("../lib/password.js");
const raw = "a".repeat(64);
await D1.prepare(
  "INSERT INTO app_sessions(token,owner,expires,admin_version) VALUES(?,?,?,?)",
)
  .bind(
    await digest(raw),
    admin,
    Date.now() + 60000,
    await digest(env.ADMIN_PHONE + env.ADMIN_PASSWORD_HASH),
  )
  .run();
globalThis.reqHeaders.set("cookie", "teja_session=" + raw);
assert.equal(
  (await call(data, { action: "reviewImage", id, approved: true })).status,
  200,
);
assert.equal(
  db.prepare("SELECT active FROM products WHERE id=?").get(id).active,
  1,
);
db.prepare("UPDATE users SET verification='pending' WHERE id=?").run(seller);
assert.equal(
  (await call(data, { action: "verifySeller", id: seller, approved: true }))
    .status,
  200,
);
assert.ok(
  db
    .prepare(
      "SELECT id FROM notifications WHERE owner=? AND kind='seller_approved'",
    )
    .get(seller),
);
const reports = await import(await load("app/api/reports/route.js"));
assert.equal((await reports.GET()).status, 200);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal((await reports.GET()).status, 403);
assert.equal(
  (
    await call(reports, {
      kind: "product",
      target: product,
      reason: "Tekshirib ko‘ring",
    })
  ).status,
  200,
);
assert.equal(
  (await call(reports, { action: "resolve", id: "missing" })).status,
  403,
);
await pickupReminders(D1);
await pickupReminders(D1);
const duplicates = db
  .prepare(
    "SELECT owner,kind,entity,COUNT(*) n FROM notifications GROUP BY owner,kind,entity HAVING n>1",
  )
  .all();
assert.equal(duplicates.length, 0);
console.log(
  "PASS: missing-AI image persists pending, seller moderation denied, admin approval publishes, seller notification, reports roles, notification deduplication",
);
