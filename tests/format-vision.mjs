import assert from "node:assert/strict";
import {
  money,
  capitalize,
  groupDigits,
  formatCard,
  cardBrand,
} from "../lib/format.js";
import { classifyResult, inspectImage } from "../lib/image-review.js";
assert.equal(money(-1500), "−1.500 so‘m");
assert.equal(money(100000), "100.000 so‘m");
assert.equal(money(1000000), "1.000.000 so‘m");
assert.equal(groupDigits("12345"), "12.345");
assert.equal(capitalize(" olma"), "Olma");
assert.equal(formatCard("4242424242424242"), "4242 4242 4242 4242");
assert.equal(cardBrand("8600 0000"), "uzcard");
assert.equal(cardBrand("5614 0000"), "uzcard");
assert.equal(cardBrand("9860 0000"), "humo");
assert.equal(cardBrand("4242"), "visa");
assert.equal(
  classifyResult({ category: "not_food", confidence: 0.99 }).status,
  "rejected",
);
assert.equal(
  classifyResult({ category: "not_food", confidence: 0.6 }).status,
  "pending",
);
assert.equal(
  classifyResult({ category: "food_photo", confidence: 0.95 }).status,
  "approved",
);
assert.equal(
  classifyResult({ category: "food_photo", confidence: "1" }).status,
  "pending",
);
assert.equal(
  (
    await inspectImage(new ArrayBuffer(1), "image/png", {
      PAYMENTS_MODE: "live",
    })
  ).status,
  "pending",
);
const env = {
  PAYMENTS_MODE: "live",
  GEMINI_API_KEY: "unit-test-not-a-real-key",
  GEMINI_MODEL: "unit-test",
};
const fakeFetch = async (url, options) => {
  assert.ok(url.startsWith("https://generativelanguage.googleapis.com/"));
  assert.ok(JSON.parse(options.body).contents[0].parts[0].inlineData);
  return Response.json({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({ category: "not_food", confidence: 0.99 }),
            },
          ],
        },
      },
    ],
  });
};
assert.equal(
  (await inspectImage(new ArrayBuffer(1), "image/png", env, fakeFetch)).status,
  "rejected",
);
assert.equal(
  (
    await inspectImage(new ArrayBuffer(1), "image/png", env, async () => {
      throw Error("offline");
    })
  ).status,
  "pending",
);
console.log(
  "PASS: dot money formatting, capitalization, card grouping/type; AI conservative thresholds and unavailable-provider fallback (mock responses, no live AI accuracy claim)",
);
