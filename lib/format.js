export const groupDigits = (v) =>
  String(v ?? "")
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
export const parseMoney = (v) => Number(String(v ?? "").replace(/\./g, ""));
export const money = (v) =>
  (Number(v)<0?"−":"") + groupDigits(Math.abs(Math.round(Number(v) || 0))) + " so‘m";
export const capitalize = (v) => {
  const s = String(v ?? "").trimStart();
  return s ? s[0].toLocaleUpperCase("uz-UZ") + s.slice(1) : s;
};
export const formatCard = (v) =>
  String(v)
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
export const cardBrand = (v) => {
  const s = String(v).replace(/\D/g, "");
  return /^(8600|5614)/.test(s)
    ? "uzcard"
    : /^9860/.test(s)
      ? "humo"
      : /^4/.test(s)
        ? "visa"
        : "unknown";
};
// Local UI fixtures, not bank-issued credentials and not provider sandbox tokens.
