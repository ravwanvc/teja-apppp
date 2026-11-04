import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  readLocalEnv,
  writeLocalEnv,
  syncLocalEnv,
} from "../scripts/local-env.mjs";
import { passwordHash, passwordMatches } from "../lib/password.js";
const dir = mkdtempSync(path.join(tmpdir(), "teja-env-test-"));
try {
  mkdirSync(path.join(dir, "dist/server"), { recursive: true });
  writeFileSync(path.join(dir, "dist/server/wrangler.json"), "{}");
  writeFileSync(
    path.join(dir, ".env"),
    'EXTRA="kept"\nADMIN_PHONE=+998901234567\n',
  );
  const hash = await passwordHash("fixture-password-123");
  writeLocalEnv({ ...readLocalEnv(dir), ADMIN_PASSWORD_HASH: hash }, dir);
  writeFileSync(path.join(dir, ".dev.vars"), "ADMIN_PHONE=+998111111111\n");
  const e = syncLocalEnv(dir);
  assert.equal(e.EXTRA, "kept");
  assert.equal(e.ADMIN_PHONE, "+998901234567");
  assert.ok(
    await passwordMatches("fixture-password-123", e.ADMIN_PASSWORD_HASH),
  );
  assert.equal(
    readFileSync(path.join(dir, ".dev.vars"), "utf8"),
    readFileSync(path.join(dir, "dist/server/.dev.vars"), "utf8"),
  );
  assert.ok(
    !readFileSync(path.join(dir, ".dev.vars"), "utf8").includes(
      "fixture-password-123",
    ),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { auth, call, load } = await import("./real-flows.mjs");
const env = globalThis.testEnv;
env.ADMIN_PHONE = "+998998856538";
env.ADMIN_PASSWORD_HASH = await passwordHash("fixture-admin-pass-123");
let r = await call(auth, {
  action: "login",
  phone: "+998998856538",
  password: "wrong-password-123",
});
assert.equal(r.status, 401);
r = await call(auth, {
  action: "login",
  phone: "+998998856538",
  password: "fixture-admin-pass-123",
      code: "123456",
});
assert.equal(r.status, 200);
assert.equal((await r.json()).redirect, "/admin");
globalThis.reqHeaders.set("cookie", r.headers.get("set-cookie").split(";")[0]);
const authLib = await import(await load("lib/auth.js"));
assert.equal((await authLib.getAppUser()).role, "admin");
r = await auth.POST(
  new Request("http://127.0.0.1:8787/api/auth", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:8787",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "login",
      phone: "+998998856538",
      password: "fixture-admin-pass-123",
      code: "123456",
    }),
  }),
);
assert.equal(r.status, 200);
assert.ok(!r.headers.get("set-cookie").includes("Secure;"));
console.log(
  "PASS: local env synchronization, no plaintext password, unified admin login and local HTTP cookie.",
);

// Explicitly disabling admin 2FA must not disable password verification.
const { adminSecondFactor, totp } = await import('../lib/totp.js');
const secret = 'JBSWY3DPEHPK3PXP'; // Public test fixture, never a real credential.
assert.equal(adminSecondFactor({ SMS_MODE: 'live', ADMIN_2FA_REQUIRED: 'false' }, ''), true);
for (const required of [undefined, 'true']) {
  const settings = { SMS_MODE: 'live', ADMIN_2FA_REQUIRED: required, ADMIN_TOTP_SECRET: secret };
  assert.equal(adminSecondFactor(settings, ''), false);
  assert.equal(adminSecondFactor(settings, totp(secret)), true);
}
env.SMS_MODE = 'live';
env.ADMIN_2FA_REQUIRED = 'false';
delete env.ADMIN_TOTP_SECRET;
async function passwordLogin(phone, password) {
  return auth.POST(new Request('http://127.0.0.1:8787/api/auth', {
    method: 'POST',
    headers: { origin: 'http://127.0.0.1:8787', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'admin', phone, password }),
  }));
}
assert.equal((await passwordLogin(env.ADMIN_PHONE, 'wrong-password-123')).status, 401);
assert.equal((await passwordLogin('+998901111111', 'fixture-admin-pass-123')).status, 401);
r = await passwordLogin(env.ADMIN_PHONE, 'fixture-admin-pass-123');
assert.equal(r.status, 200);
assert.equal((await r.json()).redirect, '/admin');
assert.equal(env.SMS_MODE, 'live');
console.log('PASS: password-only admin with live SMS, wrong credentials rejected, opt-in 2FA retained.');
