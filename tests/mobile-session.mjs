import assert from "node:assert/strict";
import { load, auth, call, D1, db } from "./real-flows.mjs";
import {
  issueMobileSession,
  rotateMobileSession,
} from "../lib/mobile-session.js";
const env = globalThis.testEnv;
const user = db
  .prepare("SELECT owner FROM app_accounts WHERE phone='+998901234567'")
  .get().owner;
const session = await issueMobileSession(D1, user);
assert.ok(
  !db
    .prepare("SELECT access_hash FROM mobile_sessions WHERE owner=?")
    .get(user)
    .access_hash.includes(session.accessToken),
);
const authLib = await import(await load("lib/auth.js"));
globalThis.reqHeaders = new Headers({
  "X-Client": "app",
  Authorization: "Bearer " + session.accessToken,
});
assert.equal((await authLib.getAppUser()).userId, user);
const [a, b] = await Promise.allSettled([
  rotateMobileSession(D1, session.refreshToken),
  rotateMobileSession(D1, session.refreshToken),
]);
assert.equal([a, b].filter((x) => x.status === "fulfilled").length, 1);
assert.equal(await authLib.getAppUser(), null);
const next = [a, b].find((x) => x.status === "fulfilled").value;
globalThis.reqHeaders.set("Authorization", "Bearer " + next.accessToken);
assert.equal((await authLib.getAppUser()).userId, user);
db.prepare("UPDATE mobile_sessions SET access_expires=0 WHERE owner=?").run(
  user,
);
assert.equal(await authLib.getAppUser(), null);
// X-Client alone must not convert a browser cookie into a bearer identity.
globalThis.reqHeaders = new Headers();
const login = await call(auth, {
  action: "login",
  phone: "+998901234567",
  password: "correct-password-123",
});
globalThis.reqHeaders = new Headers({
  "X-Client": "app",
  Cookie: login.headers.get("set-cookie").split(";")[0],
});
assert.equal(await authLib.getAppUser(), null);
// Passwordless and reset use dedicated one-time challenges, never an arbitrary code.
const { sendOtp } = await import("../lib/otp.js");
const request = (b) =>
  new Request("https://test.local/api/auth", {
    method: "POST",
    headers: {
      Origin: "https://test.local",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(b),
  });
const input = { action: "otpLogin", phone: "+998901234567", code: "123456" };
await D1.prepare("DELETE FROM phone_otps WHERE owner=?").bind("login:"+input.phone).run();
assert.equal((await auth.POST(request(input))).status, 400);
await sendOtp(env, input.phone, "login");
assert.equal((await auth.POST(request(input))).status, 200);
assert.equal((await auth.POST(request(input))).status, 400);
await sendOtp(env, input.phone, "reset");
const phoneApi=await import(await load('app/api/phone/route.js'));
const reset=await phoneApi.POST(request({action:'verify',purpose:'reset',phone:input.phone,code:'123456'}));
assert.equal(reset.status,200);
const {resetToken}=await reset.json();
assert.equal(
  (
    await auth.POST(
      request({ ...input, action: "reset", password: "new-password",confirmPassword:"new-password",resetToken }),
    )
  ).status,
  200,
);
assert.equal(
  db.prepare("SELECT count(*) n FROM mobile_sessions WHERE owner=?").get(user)
    .n,
  0,
);
console.log(
  "PASS: hashed bearer tokens, atomic refresh rotation, expired access, app-header/cookie isolation, passwordless one-time code, reset session revocation",
);
