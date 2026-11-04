export const phoneDigits = (v) =>
  String(v || "")
    .replace(/\D/g, "")
    .slice(0, 9);
export function pastedPhone(v) {
  const n = String(v || "").replace(/\D/g, "");
  return phoneDigits(n.length === 12 && n.startsWith("998") ? n.slice(3) : n);
}
export function formatExpiry(v) {
  const n = String(v || "")
    .replace(/\D/g, "")
    .slice(0, 4);
  return n.length > 2 ? n.slice(0, 2) + "/" + n.slice(2) : n;
}
export function validExpiry(v, now = new Date()) {
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(v)) return false;
  const [m, y] = v.split("/").map(Number);
  return (
    2000 + y > now.getUTCFullYear() ||
    (2000 + y === now.getUTCFullYear() && m >= now.getUTCMonth() + 1)
  );
}
