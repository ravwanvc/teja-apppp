import { getMongoDb } from "../../../lib/mongodb.js";
import { MIN_CHECKOUT_WINDOW_MS } from "../../../lib/commerce.js";
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id");
  const db = await getMongoDb();
  const now = Date.now();
  const product = await db.collection("products").findOne({
    id,
    active: { $in: [1, true] },
    until: { $gt: now + MIN_CHECKOUT_WINDOW_MS },
    $or: [{ best_before: null }, { best_before: { $gt: now } }],
  }, { projection: { _id: 0 } });
  const owner = product
    ? await db.collection("users").findOne({ id: product.owner })
    : null;
  const available = !!product && !owner?.selling_paused;
  return Response.json(
    available ? { product } : { error: "Topilmadi / Не найдено" },
    { status: available ? 200 : 404 },
  );
}
