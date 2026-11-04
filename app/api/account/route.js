import { getMongoDb } from "../../../lib/mongodb.js";
import { getAppUser, sameOrigin } from "../../../lib/auth.js";
import { env } from "../../../lib/runtime-env.js";

const reply = (value, status = 200) => Response.json(value, { status });
const rowsForOwner = async (db, collection, field, owner) =>
  db.collection(collection).find({ [field]: owner }).project({ _id: 0 }).toArray();

async function withMongoTransaction(db, callback) {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}

export async function GET() {
  const u = await getAppUser();
  if (!u) return reply({ error: "Kirish kerak" }, 401);
  const db = await getMongoDb();
  const [user, account] = await Promise.all([
    db.collection("users").findOne(
      { id: u.userId },
      { projection: { _id: 0, name: 1, role: 1 } },
    ),
    db.collection("app_accounts").findOne(
      { owner: u.userId },
      { projection: { _id: 0, phone: 1, phone_verified: 1 } },
    ),
  ]);
  const results = {
    profile: user
      ? {
          name: user.name,
          role: user.role,
          phone: account?.phone ?? null,
          phone_verified: account?.phone_verified ?? null,
        }
      : null,
  };
  for (const [name, field] of [
    ["orders", "buyer"],
    ["products", "owner"],
    ["reviews", "buyer"],
    ["notifications", "owner"],
  ])
    results[name] = await rowsForOwner(db, name, field, u.userId);
  return Response.json(results, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="teja-export.json"',
    },
  });
}

export async function POST(req) {
  if (!sameOrigin(req)) return reply({ error: "Origin" }, 403);
  const u = await getAppUser();
  if (!u) return reply({ error: "Kirish kerak" }, 401);
  if (u.role === "admin")
    return reply({ error: "Admin hisobi alohida boshqariladi" }, 403);
  const db = await getMongoDb();
  const account = await db
    .collection("app_accounts")
    .findOne({ owner: u.userId }, { projection: { phone: 1 } });
  const phone = account?.phone;
  const b = await req.json();
  if (b.confirm !== "DELETE")
    return reply({ error: "DELETE bilan tasdiqlang" }, 400);

  try {
    let avatar;
    await withMongoTransaction(db, async (session) => {
      const users = db.collection("users");
      const products = db.collection("products");
      const orders = db.collection("orders");
      const user = await users.findOne(
        { id: u.userId },
        { projection: { avatar: 1 }, session },
      );
      avatar = user?.avatar;
      const productIds = await products
        .find({ owner: u.userId }, { projection: { id: 1 }, session })
        .map((product) => product.id)
        .toArray();
      const activeOrder = await orders.findOne(
        {
          $and: [
            {
              $or: [
                { buyer: u.userId },
                { product: { $in: productIds } },
              ],
            },
            {
              $or: [
                { status: { $in: ["pending_payment", "reserved"] } },
                { payment_state: { $in: ["refund_due", "test_refund_due"] } },
              ],
            },
          ],
        },
        { projection: { _id: 1 }, session },
      );
      if (activeOrder)
        throw Error("Faol buyurtma yoki qaytarish bor");

      const now = Date.now();
      const imageKeys = await db
        .collection("image_checks")
        .find({ owner: u.userId }, { projection: { key: 1 }, session })
        .toArray();
      const deletionKeys = imageKeys.map(({ key }) => key);
      if (avatar?.startsWith("/api/profile?image="))
        deletionKeys.push(decodeURIComponent(avatar.split("image=")[1]));
      for (const key of new Set(deletionKeys))
        await db.collection("deletion_jobs").updateOne(
          { key },
          { $setOnInsert: { key, created: now } },
          { upsert: true, session },
        );

      await db.collection("recovery_codes").deleteMany(
        { owner: u.userId },
        { session },
      );
      await db.collection("password_resets").deleteMany(
        { phone: phone || "" },
        { session },
      );
      await db.collection("shop_follows").deleteMany(
        { $or: [{ owner: u.userId }, { seller: u.userId }] },
        { session },
      );
      await db.collection("waitlist").deleteMany(
        { owner: u.userId },
        { session },
      );
      await db.collection("quality_claims").updateMany(
        { owner: u.userId },
        { $set: { reason: "Deleted", reply: "" } },
        { session },
      );
      await db.collection("phone_otps").deleteMany(
        {
          owner: {
            $in: [
              "login:" + phone,
              "register:" + phone,
              "reset:" + phone,
              "verify:" + phone,
            ],
          },
        },
        { session },
      );
      await db.collection("app_accounts").deleteOne(
        { owner: u.userId },
        { session },
      );
      await users.updateOne(
        { id: u.userId },
        {
          $set: {
            name: "Deleted",
            avatar: "",
            role: "deleted",
            business_name: null,
            business_contact: null,
            verified: 0,
            verification: "none",
          },
        },
        { session },
      );
      await products.updateMany(
        { owner: u.userId },
        {
          $set: {
            active: 0,
            title: "Deleted",
            shop: "Deleted",
            image: "",
            images: "[]",
            address: "",
            lat: 0,
            lng: 0,
            allergens: "",
            storage: "",
          },
        },
        { session },
      );
      await db.collection("reviews").updateMany(
        { buyer: u.userId },
        { $set: { comment: "", hidden: 1 } },
        { session },
      );
      await orders.updateMany(
        { product: { $in: productIds } },
        { $set: { snapshot: "{}" } },
        { session },
      );
      for (const [collection, field] of [
        ["app_sessions", "owner"],
        ["mobile_sessions", "owner"],
        ["saved_cards", "owner"],
        ["demo_wallet", "owner"],
        ["listing_drafts", "owner"],
        ["image_checks", "owner"],
        ["notifications", "owner"],
        ["favorites", "user"],
        ["reports", "reporter"],
      ])
        await db.collection(collection).deleteMany(
          { [field]: u.userId },
          { session },
        );
    });

    const jobs = await db
      .collection("deletion_jobs")
      .find({}, { projection: { key: 1 } })
      .limit(100)
      .toArray();
    for (const job of jobs) {
      try {
        await env.BUCKET.delete(job.key);
        await db.collection("deletion_jobs").deleteOne({ key: job.key });
      } catch {
        // Durable cleanup is retried by the scheduled worker.
      }
    }
    return Response.json(
      { ok: true },
      {
        headers: {
          "Set-Cookie":
            "teja_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
        },
      },
    );
  } catch {
    return reply(
      {
        error:
          "Faol buyurtma yoki qaytarish bor. Avval yakunlang / Завершите активные заказы и возвраты",
      },
      409,
    );
  }
}
