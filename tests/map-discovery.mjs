import assert from "node:assert/strict";
import {
  distanceKm,
  validPoint,
  groupPins,
  mapProducts,
} from "../lib/map-discovery.js";
assert.equal(distanceKm({ lat: 41, lng: 69 }, { lat: 41, lng: 69 }), 0);
assert.ok(
  Math.abs(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 111.195) < 0.01,
);
assert.equal(validPoint({ lat: null, lng: 69 }), false);
assert.equal(validPoint({ lat: 91, lng: 0 }), false);
const base = { active: 1, stock: 2, until: 2000, lat: 41, lng: 69 };
const ps = [
  { ...base, id: 1 },
  { ...base, id: 2 },
  { ...base, id: 3, lat: 42 },
  { ...base, id: 4, stock: 0 },
  { ...base, id: 5, active: 0 },
  { ...base, id: 6, until: 999 },
  { ...base, id: 7, lat: null },
];
assert.deepEqual(
  mapProducts(ps, null, 0, 1000).map((p) => p.id),
  [1, 2, 3],
);
assert.deepEqual(
  mapProducts(ps, { lat: 41, lng: 69 }, 1, 1000).map((p) => p.id),
  [1, 2],
);
const groups = groupPins(ps.slice(0, 3), (p) => ({
  x: p.lng * 100,
  y: p.lat * 100,
}));
assert.deepEqual(
  groups.map((g) => g.map((p) => p.id)),
  [[1, 2], [3]],
);
console.log(
  "PASS: exact-coordinate grouping, distance units, radius filtering, missing coordinates and unavailable listings.",
);
