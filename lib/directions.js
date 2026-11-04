// Public Maps links: no paid routing API or key. Origin is chosen by the map app.
export function destination(point = {}) {
  const valid = (v) =>
    v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  if (
    valid(point.lat) &&
    valid(point.lng) &&
    Math.abs(Number(point.lat)) <= 90 &&
    Math.abs(Number(point.lng)) <= 180
  )
    return `${Number(point.lat)},${Number(point.lng)}`;
  return typeof point.address === "string"
    ? point.address.trim().slice(0, 500)
    : "";
}
export function directionsLinks(point) {
  const to = destination(point);
  if (!to) return null;
  return {
    google:
      "https://www.google.com/maps/dir/?" +
      new URLSearchParams({ api: "1", destination: to }),
    place:
      "https://www.google.com/maps/search/?" +
      new URLSearchParams({ api: "1", query: to }),
  };
}
