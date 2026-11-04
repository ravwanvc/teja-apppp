import assert from "node:assert/strict";
import { directionsLinks, destination } from "../lib/directions.js";
const d = directionsLinks({
  lat: 41.311081,
  lng: 69.240562,
  address: "Toshkent",
});
assert.equal(
  new URL(d.google).searchParams.get("destination"),
  "41.311081,69.240562",
);
assert.equal(new URL(d.google).searchParams.get("api"), "1");
assert.equal(
  destination({ lat: null, lng: null, address: "Do‘kon & non" }),
  "Do‘kon & non",
);
assert.equal(
  new URL(directionsLinks({ address: "Do‘kon & non" }).google).searchParams.get(
    "destination",
  ),
  "Do‘kon & non",
);
assert.equal(directionsLinks({ lat: 100, lng: 200 }), null);
assert.equal(destination({ lat: 0, lng: 0 }), "0,0");
console.log(
  "PASS: map coordinates, encoding, address fallback and invalid-point handling",
);
