import { MIN_CHECKOUT_WINDOW_MS } from "./commerce.js";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function catalog(db, params) {
  const now = Date.now();
  const page = Math.max(1, Math.min(100000, parseInt(params.get("page")) || 1));
  const limit = Math.max(1, Math.min(60, parseInt(params.get("limit")) || 24));
  const pausedOwners = await db
    .collection("users")
    .distinct("id", { selling_paused: { $in: [1, true] } });
  const filter = {
    active: { $in: [1, true] },
    owner: { $nin: pausedOwners },
    $and: [
      { $or: [{ best_before: null }, { best_before: { $gt: now } }] },
      {
        stock:
          params.get("includeSoldOut") === "1" ? { $gte: 0 } : { $gt: 0 },
      },
      { until: { $gt: now + MIN_CHECKOUT_WINDOW_MS } },
    ],
  };
  if (params.get("q")) {
    const q = params.get("q").slice(0, 100);
    const expression = new RegExp(escapeRegex(q), "i");
    filter.$and.push({ $or: [{ title: expression }, { shop: expression }] });
  }
  for (const field of ["city", "category", "owner"]) {
    if (params.get(field))
      filter[field] = params.get(field).slice(0, 100);
  }
  const maxPrice = Number(params.get("maxPrice"));
  if (maxPrice > 0) filter.price = { $lte: maxPrice };

  const sortField =
    { price: "price", ending: "until", new: "created" }[params.get("sort")] ||
    "created";
  const direction = params.get("sort") === "price" || params.get("sort") === "ending" ? 1 : -1;
  const productsCollection = db.collection("products");
  const [total, rows] = await Promise.all([
    productsCollection.countDocuments(filter),
    productsCollection
      .find(filter)
      .sort({ [sortField]: direction, id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .project({ _id: 0 })
      .toArray(),
  ]);
  const ids = rows.map((product) => product.id);
  const owners = [...new Set(rows.map((product) => product.owner))];
  const [users, reviews] = await Promise.all([
    db
      .collection("users")
      .find(
        { id: { $in: owners } },
        { projection: { _id: 0, id: 1, verified: 1 } },
      )
      .toArray(),
    ids.length
      ? db
          .collection("reviews")
          .aggregate([
            { $match: { product: { $in: ids }, hidden: { $in: [0, false] } } },
            {
              $group: {
                _id: "$product",
                rating: { $avg: "$rating" },
                review_count: { $sum: 1 },
              },
            },
          ])
          .toArray()
      : [],
  ]);
  const userById = new Map(users.map((user) => [user.id, user]));
  const reviewById = new Map(reviews.map((review) => [review._id, review]));
  const result = rows.filter((product) => userById.has(product.owner)).map((product) => {
    const review = reviewById.get(product.id);
    return {
      ...product,
      seller_verified: userById.get(product.owner)?.verified || 0,
      rating: review ? Math.round(review.rating * 10) / 10 : null,
      review_count: review?.review_count || 0,
    };
  });
  return {
    products: result,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  };
}
