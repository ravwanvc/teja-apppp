const enc = new TextEncoder();
export const hex = (b) =>
  Array.from(new Uint8Array(b), (v) => v.toString(16).padStart(2, "0")).join(
    "",
  );
export async function digest(s) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}
export async function passwordHash(
  password,
  salt = hex(crypto.getRandomValues(new Uint8Array(16))),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return `pbkdf2:100000:${salt}:${hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256))}`;
}
export function equal(a, b) {
  a = String(a || "");
  b = String(b || "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function passwordMatches(p, h) {
  if (!/^pbkdf2:100000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(h || "")) return false;
  return equal(await passwordHash(p, h.split(":")[2]), h);
}
export function phoneNumber(v) {
  let p = String(v || "").replace(/\D/g, "");
  if (/^\d{9}$/.test(p)) p = "998" + p;
  return /^998\d{9}$/.test(p) ? "+" + p : null;
}
