import assert from "node:assert/strict";
import {
  load,
  db,
  data,
  auth,
  product,
  sellerCookie,
  seller,
  call,
} from "./real-flows.mjs";
import { listingIssues, listingState, fitPhoto } from "../lib/listing-tools.js";
const logged = await call(auth, {
  action: "login",
  phone: "+998901234567",
  password: "correct-password-123",
});
const buyerCookie = logged.headers.get("set-cookie").split(";")[0];
const drafts = await import(await load("app/api/drafts/route.js"));
globalThis.reqHeaders = new Headers({ cookie: sellerCookie });
const id = "listing-draft-0000000001";
const p = db.prepare("SELECT * FROM products WHERE id=?").get(product);
const body = {
  ...p,
  until: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
};
assert.deepEqual(listingIssues(body), {});
assert.ok(listingIssues({ ...body, original: 100, price: 100 }).original);
assert.ok(listingIssues({ ...body, lat: null }).location);
assert.ok(listingIssues({ ...body, until: "2000-01-01" }).until);
assert.deepEqual(fitPhoto(4000, 3000), { width: 1600, height: 1200 });
assert.deepEqual(fitPhoto(600, 800), { width: 600, height: 800 });
assert.equal(listingState({ ...p, stock: 0 }), "soldout");
assert.equal(
  (await call(drafts, { action: "save", id, version: 0, body })).status,
  200,
);
let list = await (await drafts.GET()).json();
assert.equal(list.drafts[0].version, 1);
assert.equal(list.drafts[0].body.owner, undefined);
assert.equal(
  (await call(drafts, { action: "save", id, version: 0, body })).status,
  409,
);
globalThis.reqHeaders.set("cookie", buyerCookie);
assert.equal((await drafts.GET()).status, 403);
assert.equal(
  (await call(drafts, { action: "delete", id, version: 1 })).status,
  403,
);
assert.equal(
  (
    await call(drafts, {
      action: "save",
      id: "another-draft-000001",
      version: 0,
      body,
    })
  ).status,
  403,
);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal(
  (
    await call(drafts, {
      action: "save",
      id,
      version: 1,
      body: { ...body, title: "Bread updated" },
    })
  ).status,
  200,
);
const create = {
  action: "create",
  requestId: id,
  draftVersion: 2,
  product: { ...body, until: Date.now() + 86400000 },
};
assert.equal((await call(data, create)).status, 200);
const first = db.prepare("SELECT stock FROM products WHERE id=?").get(id).stock;
assert.equal((await call(data, create)).status, 200);
assert.equal(
  db.prepare("SELECT stock FROM products WHERE id=?").get(id).stock,
  first,
);
assert.equal((await (await drafts.GET()).json()).drafts.length, 0);
assert.equal(
  (await call(drafts, { action: "save", id, version: 2, body })).status,
  409,
);
globalThis.reqHeaders.set("cookie", buyerCookie);
assert.equal((await call(data, create)).status, 403);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal(
  (
    await call(drafts, {
      action: "save",
      id: "listing-invalid-00001",
      version: 0,
      body: { title: 5, image: "https://evil.example/a" },
    })
  ).status,
  400,
);
console.log(
  "PASS: private versioned drafts, stale writes rejected, publication removes matching draft, retry does not duplicate products or stock, listing validation and photo dimensions.",
);
