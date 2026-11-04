import assert from "node:assert/strict";
import { formatCard, cardBrand } from "../lib/format.js";
import {
  phoneDigits,
  pastedPhone,
  formatExpiry,
  validExpiry,
} from "../lib/card-form.js";
assert.equal(formatCard("860006919540631112345"), "8600 0691 9540 6311");
assert.equal(cardBrand("8600 0691"), "uzcard");
assert.equal(cardBrand("9860"), "humo");
assert.equal(cardBrand("4111"), "visa");
assert.equal(cardBrand("1234"), "unknown");
assert.equal(phoneDigits("90123456789"), "901234567");
assert.equal(phoneDigits("a90 b12345"), "9012345");
assert.equal(pastedPhone("+998 90 123 45 67"), "901234567");
assert.equal(pastedPhone("998856538"), "998856538");
assert.equal(formatExpiry("122999"), "12/29");
const now = new Date("2026-10-25T00:00:00Z");
assert.equal(validExpiry("10/26", now), true);
for (const v of ["09/26", "00/30", "13/30", "12/2", "12/20"])
  assert.equal(validExpiry(v, now), false);
assert.equal(validExpiry("01/27", now), true);
console.log(
  "PASS: card grouping and prefix, exact local phone length, international paste and expiry validation.",
);
