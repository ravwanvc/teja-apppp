export function validPoint(p) {
  return (
    Number.isFinite(p?.lat) &&
    Number.isFinite(p?.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dlat = rad(b.lat - a.lat),
    dlng = rad(b.lng - a.lng);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
// Group nearby screen positions, including multiple products at exactly one shop.
export function groupPins(products, project, size = 64) {
  const buckets = new Map();
  for (const p of products) {
    const pos = project(p),
      key = Math.floor(pos.x / size) + ":" + Math.floor(pos.y / size);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  return [...buckets.values()];
}
export function mapProducts(products, loc, radius = 0, now = Date.now()) {
  return products.filter(
    (p) =>
      validPoint(p) &&
      p.active &&
      p.stock > 0 &&
      p.until > now &&
      (!loc || !radius || distanceKm(loc, p) <= radius),
  );
}
