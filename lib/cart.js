import { MIN_CHECKOUT_WINDOW_MS } from "./commerce.js";

export async function prepareCart(db, items, buyer, now = Date.now()) {
  if (!Array.isArray(items) || !items.length || items.length > 20)
    throw Error("Savatda 1–20 xil mahsulot bo‘lishi kerak");
  const result = [];
  let seller;
  for (const item of items) {
    if (
      typeof item.id !== "string" ||
      !Number.isInteger(item.qty) ||
      item.qty < 1 ||
      item.qty > 1000 ||
      result.some((product) => product.id === item.id)
    )
      throw Error("Savat miqdori noto‘g‘ri");
    const product = await db.collection("products").findOne({ id: item.id });
    const owner = product
      ? await db.collection("users").findOne({ id: product.owner })
      : null;
    if (
      !product ||
      !product.active ||
      !owner ||
      owner.selling_paused
    )
      throw Error(
        "Mahsulot endi mavjud emas yoki sotuv vaqtincha to‘xtatilgan",
      );
    if (product.best_before && product.best_before <= now)
      throw Error("Mahsulotning iste’mol muddati tugagan");
    if (product.stock < item.qty)
      throw Error(`Qoldiq yetarli emas. Hozir ${product.stock} dona qoldi`);
    if (product.until < now + MIN_CHECKOUT_WINDOW_MS)
      throw Error(
        "Taklif tugashiga 10 daqiqadan kam qoldi. Boshqa mahsulot tanlang",
      );
    if (product.owner === buyer)
      throw Error("O‘z mahsulotingizni xarid qila olmaysiz");
    if (seller && seller !== product.owner)
      throw Error("Bitta buyurtma — bitta do‘kon");
    seller = product.owner;
    result.push({
      id: product.id,
      title: product.title,
      price: product.price,
      original: product.original,
      qty: item.qty,
      until: product.until,
      image: product.image,
      owner: product.owner,
      shop: product.shop,
      address: product.address,
      lat: product.lat,
      lng: product.lng,
      allergens: product.allergens,
      storage: product.storage,
      prepared_at: product.prepared_at,
      best_before: product.best_before,
    });
  }
  result.sort((a, b) => a.until - b.until || a.id.localeCompare(b.id));
  return {
    items: result,
    total: result.reduce((sum, product) => sum + product.price * product.qty, 0),
    until: Math.min(...result.map((product) => product.until)),
  };
}
