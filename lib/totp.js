import { createHmac } from "node:crypto";
import { equal } from "./password.js";
import { mockSms } from "./modes.js";
export function totp(secret, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/=+$/, "")) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw Error("TOTP secret noto‘g‘ri");
    bits += n.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    (bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest(),
    o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, "0");
}
export function adminSecondFactor(e, code) {
  if (e.ADMIN_2FA_REQUIRED === "false") return true;
  if (mockSms(e)) return equal(code, "123456");
  if (!e.ADMIN_TOTP_SECRET)
    throw Object.assign(Error("ADMIN_TOTP_SECRET sozlanmagan"), {
      status: 503,
    });
  return [-30000, 0, 30000].some((offset) =>
    equal(code, totp(e.ADMIN_TOTP_SECRET, Date.now() + offset)),
  );
}
