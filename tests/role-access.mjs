import assert from "node:assert/strict";
import { load, auth, data, image, call, sellerCookie } from "./real-flows.mjs";
import { allowedView, canSell } from "../lib/roles.js";
const drafts = await import(await load("app/api/drafts/route.js"));
const report = await import(await load("app/api/report/route.js"));
for (const value of [
  "901234567",
  "+99890123456",
  "+9989012345678",
  "+997901234567",
  "+99890123456a",
])
  assert.equal(
    (
      await call(auth, {
        action: "login",
        phone: value,
        password: "correct-password-123",
      })
    ).status,
    400,
  );
let response = await call(auth, {
  action: "login",
  phone: "+998901234567",
  password: "correct-password-123",
  role: "admin",
});
assert.equal(response.status, 200);
assert.equal((await response.clone().json()).redirect, "/");
globalThis.reqHeaders.set(
  "cookie",
  response.headers.get("set-cookie").split(";")[0],
);
for (const action of [
  "create",
  "replaceImage",
  "editProduct",
  "restock",
  "toggle",
  "collect",
  "requestVerification",
])
  assert.equal((await call(data, { action })).status, 403, action);
assert.equal((await drafts.GET()).status, 403);
assert.equal((await call(drafts, { action: "save" })).status, 403);
assert.equal(
  (
    await image.POST(
      new Request("https://test.local/api/image", { method: "POST" }),
    )
  ).status,
  403,
);
assert.equal((await report.GET()).status, 403);
assert.equal((await (await data.GET()).json()).report, null);
for (const view of ["seller", "admin"])
  assert.equal(allowedView("member", view), "market");
assert.equal(allowedView("seller", null), "seller");
assert.equal(allowedView("seller", "admin"), "seller");
assert.equal(allowedView("admin", "admin"), "admin");
assert.equal(canSell("member"), false);
globalThis.reqHeaders.set("cookie", sellerCookie);
assert.equal((await drafts.GET()).status, 200);
assert.equal((await report.GET()).status, 200);
response = await call(auth, {
  action: "login",
  phone: "+998901234568",
  password: "seller-password-123",
});
assert.equal((await response.json()).redirect, "/?view=seller");
console.log(
  "PASS: customer cannot publish, upload, edit inventory, collect orders, access drafts or sales reports; strict phone format, role routing, seller access and submitted-role escalation protection.",
);
