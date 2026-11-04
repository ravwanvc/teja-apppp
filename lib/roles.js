export const canSell = (role) => role === "seller";
export function allowedView(role, view) {
  const fallback =
    role === "seller" ? "seller" : role === "admin" ? "admin" : "market";
  if (!view) return fallback;
  if (view === "seller") return canSell(role) ? view : fallback;
  if (view === "admin") return role === "admin" ? view : fallback;
  return ["market", "orders", "account", "map"].includes(view) ? view : fallback;
}
export const sellerActions = new Set([
  "quickDay",
  "create",
  "replaceImage",
  "editProduct",
  "restock",
  "toggle",
  "collect",
  "requestVerification",
]);
