import { getMongoDb } from "../../../lib/mongodb.js";
import { MIN_CHECKOUT_WINDOW_MS } from "../../../lib/commerce.js";

export async function GET(req) {
  const params = new URL(req.url).searchParams;
  const now = Date.now();
  const page = Math.max(1, Math.min(100000, parseInt(params.get("page")) || 1));
  const limit = Math.max(1, Math.min(60, parseInt(params.get("limit")) || 24));
  const match = {
    active: 1,
    until: { $gt: now + MIN_CHECKOUT_WINDOW_MS },
    stock: params.get("includeSoldOut") === "1" ? { $gte: 0 } : { $gt: 0 },
    $or: [{ best_before: null }, { best_before: { $gt: now } }],
  };
  const q = params.get("q");
  if (q) {
    const literal = q.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    match.$and = [
      {
        $or: [
          { title: { $regex: literal, $options: "i" } },
          { shop: { $regex: literal, $options: "i" } },
        ],
      },
    ];
  }
  for (const field of ["city", "category", "owner"])
    if (params.get(field)) match[field] = params.get(field).slice(0, 100);
  if (Number(params.get("maxPrice")) > 0)
    match.price = { $lte: Number(params.get("maxPrice")) };

  const sort = {
    price: { price: 1, id: 1 },
    ending: { until: 1, id: 1 },
    new: { created: -1, id: 1 },
  }[params.get("sort")] || { created: -1, id: 1 };
  const db = await getMongoDb();
  const [result] = await db
    .collection("products")
    .aggregate([
      { $match: match },
      {
        $facet: {
          products: [
            {
              $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "id",
                as: "seller",
              },
            },
            { $unwind: "$seller" },
            { $match: { "seller.selling_paused": { $ne: 1 } } },
            {
              $lookup: {
                from: "reviews",
                let: { productId: "$id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$product", "$$productId"] },
                          { $eq: ["$hidden", 0] },
                        ],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      rating: { $avg: "$rating" },
                      review_count: { $sum: 1 },
                    },
                  },
                ],
                as: "review_stats",
              },
            },
            {
              $set: {
                seller_verified: "$seller.verified",
                rating: {
                  $cond: [
                    { $gt: [{ $size: "$review_stats" }, 0] },
                    {
                      $round: [
                        { $arrayElemAt: ["$review_stats.rating", 0] },
                        1,
                      ],
                    },
                    null,
                  ],
                },
                review_count: {
                  $ifNull: [
                    { $arrayElemAt: ["$review_stats.review_count", 0] },
                    0,
                  ],
                },
              },
            },
            { $unset: ["seller", "review_stats", "_id"] },
            { $sort: sort },
            { $skip: (page - 1) * limit },
            { $limit: limit },
          ],
          total: [
            {
              $lookup: {
                from: "users",
                localField: "owner",
                foreignField: "id",
                as: "seller",
              },
            },
            { $match: { "seller.selling_paused": { $ne: 1 } } },
            { $count: "count" },
          ],
        },
      },
    ])
    .toArray();
  const total = result?.total?.[0]?.count || 0;
  return Response.json(
    {
      products: result?.products || [],
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
