import { headers } from "next/headers";
import { freshness } from "../../../lib/partners.js";
import { prepareCart } from "../../../lib/cart.js";
import { catalog } from "../../../lib/catalog.js";
import { mockPayments } from "../../../lib/modes.js";
import { canSell, sellerActions } from "../../../lib/roles.js";
import { getMongoClient, getMongoDb } from "../../../lib/mongodb.js";
import { digest, phoneNumber } from "../../../lib/password.js";
import {
  expireOrders,
  MIN_CHECKOUT_WINDOW_MS,
  splitTotal,
  createOrderWithStock,
  incrementChanges,
  notifyStockAvailable,
  updateOrder,
} from "../../../lib/commerce.js";
import {
  mongoUnavailable,
  MONGO_HINT,
  logError,
} from "../../../lib/mongo-errors.js";
import { paymentConfig, paymentUrl } from "../../../lib/payments.js";
import { capitalize } from "../../../lib/format.js";
export const dynamic = "force-dynamic";
const json = (v, s = 200) =>
  Response.json(v, { status: s, headers: { "Cache-Control": "no-store" } });
const fail = (m) => {
  throw new Error(m);
};
const env = new Proxy(
  {
    PAYMENTS_MODE: "mock",
    SMS_MODE: "off",
    SMS_REQUIRED: "false",
    ADMIN_2FA_REQUIRED: "false",
    REMINDER_SMS_READY: "false",
    PAYMENT_CALLBACKS_READY: "false",
    SUBSCRIBE_PAYMENTS_READY: "false",
    DEMO_MODE: "true",
    IMAGE_REVIEW_REQUIRED: "true",
  },
  {
    get(target, name) {
      if (name in target) return target[name];
      if (/^(TWILIO_|PAYME_|CLICK_|ADMIN_TOTP_SECRET)/.test(String(name)))
        return undefined;
      return process.env[name];
    },
  },
);
const clean = (row) => {
  if (!row) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "_id"),
  );
};
const active = (value) => value === true || value === 1;

async function transaction(work) {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function authenticatedUser(db) {
  const requestHeaders = await headers();
  const now = Date.now();
  let userId;
  if (requestHeaders.get("x-client") === "app") {
    const raw = requestHeaders
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!/^[a-f0-9]{64}$/.test(raw || "")) return null;
    const session = await db.collection("mobile_sessions").findOne({
      access_hash: await digest(raw),
      access_expires: { $gt: now },
      refresh_expires: { $gt: now },
    });
    const user = session
      ? await db.collection("users").findOne({ id: session.owner })
      : null;
    if (!user || user.role === "admin") return null;
    userId = user.id;
  } else {
    const raw = requestHeaders
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("teja_session="))
      ?.slice(13);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
    const session = await db.collection("app_sessions").findOne({
      token: await digest(raw),
      expires: { $gt: now },
    });
    const user = session
      ? await db.collection("users").findOne({ id: session.owner })
      : null;
    if (!user) return null;
    if (
      user.role === "admin" &&
      (!env.ADMIN_PASSWORD_HASH ||
        session.admin_version !==
          (await digest(
            (phoneNumber(env.ADMIN_PHONE) || "") + env.ADMIN_PASSWORD_HASH,
          )))
    )
      return null;
    userId = user.id;
  }
  return clean(await db.collection("users").findOne({ id: userId }));
}

async function user(db) {
  return authenticatedUser(db);
}

async function phoneVerified(db, owner) {
  const account = await db.collection("app_accounts").findOne(
    { owner },
    { projection: { phone_verified: 1 } },
  );
  return !!account?.phone_verified;
}

async function throttle(db, key, limit, windowMs = 900000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const id = await digest(key + ":" + bucket);
  const result = await db.collection("auth_limits").findOneAndUpdate(
    { key: id },
    {
      $setOnInsert: { key: id, expires: now + windowMs },
      $inc: { n: 1 },
    },
    { upsert: true, returnDocument: "after" },
  );
  await db.collection("auth_limits").deleteMany({ expires: { $lt: now } });
  return (result?.value || result)?.n <= limit;
}

async function notifications(db, owner, kind, entity, created, session) {
  if (!owner) return;
  await db.collection("notifications").updateOne(
    { owner, kind, entity },
    {
      $setOnInsert: {
        id: crypto.randomUUID(),
        owner,
        kind,
        entity,
        created,
        read_at: null,
      },
    },
    { upsert: true, session },
  );
}

async function growthData(db, me) {
  const favorites = me
    ? (
        await db
          .collection("favorites")
          .find({ user: me.id }, { projection: { _id: 0, product: 1 } })
          .toArray()
      ).map((favorite) => favorite.product)
    : [];
  const reviewFilter =
    me?.role === "admin" ? {} : { hidden: { $in: [0, false] } };
  const reviews = await db
    .collection("reviews")
    .find(reviewFilter, {
      projection: {
        _id: 0,
        order_id: 1,
        product: 1,
        rating: 1,
        comment: 1,
        hidden: 1,
        created: 1,
      },
    })
    .sort({ created: -1 })
    .limit(500)
    .toArray();
  const sellers =
    me?.role === "admin"
      ? await db
          .collection("users")
          .find(
            { role: "seller" },
            {
              projection: {
                _id: 0,
                id: 1,
                name: 1,
                verified: 1,
                verification: 1,
                business_name: 1,
                business_contact: 1,
                selling_paused: 1,
              },
            },
          )
          .sort({ created: -1 })
          .toArray()
      : [];
  let report = null;
  if (me && ["seller", "admin"].includes(me.role)) {
    const products = await db
      .collection("products")
      .find(
        me.role === "admin" ? {} : { owner: me.id },
        { projection: { id: 1 } },
      )
      .toArray();
    const productIds = products.map((product) => product.id);
    const orders = productIds.length
      ? await db
          .collection("orders")
          .find({
            product: { $in: productIds },
            status: "collected",
            provider: { $ne: "demo" },
            is_mock: 0,
          })
          .toArray()
      : [];
    report = orders.reduce(
      (summary, order) => {
        const items = JSON.parse(order.cart_items || "[]");
        summary.orders_count++;
        summary.units += items.length
          ? items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
          : Number(order.qty || 0);
        summary.revenue += Number(order.price || 0) * Number(order.qty || 0);
        if (order.provider === "cash" && order.payment_state !== "refunded")
          summary.commission += Number(order.commission_due || 0);
        else if (order.payment_state === "paid")
          summary.commission += Number(order.deposit || 0);
        return summary;
      },
      { orders_count: 0, units: 0, revenue: 0, commission: 0 },
    );
  }
  return { favorites, reviews, sellers, report };
}

async function growthAction(db, me, body) {
  const str = (value, max) =>
    typeof value === "string" && value.trim() && value.length <= max
      ? value.trim()
      : fail("Maydonlarni to‘g‘ri to‘ldiring");
  const int = (value, min, max) =>
    Number.isSafeInteger(Number(value)) &&
    Number(value) >= min &&
    Number(value) <= max
      ? Number(value)
      : fail("Son noto‘g‘ri");
  if (body.action === "favorite") {
    const id = str(body.id, 100);
    if (!(await db.collection("products").findOne({ id }, { projection: { id: 1 } })))
      fail("Mahsulot topilmadi");
    const filter = { user: me.id, product: id };
    if (body.saved === true) {
      await db.collection("favorites").updateOne(
        filter,
        {
          $setOnInsert: {
            id: me.id + ":" + id,
            user: me.id,
            product: id,
            created: Date.now(),
          },
        },
        { upsert: true },
      );
    } else if (body.saved === false) {
      await db.collection("favorites").deleteOne(filter);
    } else fail("Amal noto‘g‘ri");
    return { ok: true };
  }
  if (body.action === "review") {
    const order = await db.collection("orders").findOne({ id: str(body.id, 100) });
    const product = order
      ? await db.collection("products").findOne({ id: order.product })
      : null;
    if (
      !order ||
      order.buyer !== me.id ||
      order.status !== "collected" ||
      order.provider === "demo" ||
      product?.owner === me.id
    )
      fail("Faqat o‘zingiz olgan haqiqiy buyurtmaga baho berishingiz mumkin");
    if (await db.collection("reviews").findOne({ order_id: order.id }))
      fail("Bu buyurtmaga baho berilgan");
    await transaction(async (session) => {
      const created = Date.now();
      await db.collection("reviews").insertOne(
        {
          order_id: order.id,
          product: order.product,
          buyer: me.id,
          rating: int(body.rating, 1, 5),
          comment: str(body.comment, 1000),
          hidden: 0,
          created,
        },
        { session },
      );
      await notifications(db, product.owner, "review", order.id, created, session);
      await incrementChanges(db, session);
    });
    return { ok: true };
  }
  if (body.action === "moderateReview") {
    if (me.role !== "admin") fail("Faqat admin uchun");
    if (typeof body.hidden !== "boolean") fail("Amal noto‘g‘ri");
    await transaction(async (session) => {
      const result = await db.collection("reviews").updateOne(
        { order_id: str(body.id, 100) },
        { $set: { hidden: body.hidden ? 1 : 0 } },
        { session },
      );
      if (result.modifiedCount) await incrementChanges(db, session);
    });
    return { ok: true };
  }
  if (body.action === "requestVerification") {
    if (me.verified) fail("Sotuvchi allaqachon tasdiqlangan");
    await transaction(async (session) => {
      await db.collection("users").updateOne(
        { id: me.id, verified: { $in: [0, false] } },
        {
          $set: {
            business_name: str(body.name, 100),
            business_contact: str(body.contact, 150),
            verification: "pending",
          },
        },
        { session },
      );
      await incrementChanges(db, session);
    });
    return { ok: true };
  }
  if (body.action === "verifySeller") {
    if (me.role !== "admin") fail("Faqat admin uchun");
    if (typeof body.approved !== "boolean") fail("Amal noto‘g‘ri");
    const id = str(body.id, 100);
    const verification = body.approved ? "approved" : "rejected";
    await transaction(async (session) => {
      const previous = await db.collection("users").findOne(
        {
          id,
          role: "seller",
          verification: { $ne: "none" },
        },
        { session },
      );
      if (!previous) fail("Ariza topilmadi");
      const result = await db.collection("users").updateOne(
        { id, role: "seller", verification: { $ne: "none" } },
        { $set: { verified: body.approved ? 1 : 0, verification } },
        { session },
      );
      if (!result.modifiedCount) fail("Ariza topilmadi");
      if (previous.verification !== verification)
        await notifications(
          db,
          id,
          "seller_" + verification,
          id,
          Date.now(),
          session,
        );
      await incrementChanges(db, session);
    });
    return { ok: true };
  }
  if (["editProduct", "restock"].includes(body.action)) {
    const product = await db
      .collection("products")
      .findOne({ id: str(body.id, 100) });
    if (!product || (product.owner !== me.id && me.role !== "admin"))
      fail("Bu mahsulotni boshqarishga ruxsat yo‘q");
    if (body.action === "restock") {
      const qty = int(body.qty, 1, 10000);
      const key = str(body.requestId, 100);
      const previous = await db.collection("stock_events").findOne({ id: key });
      if (previous) {
        if (previous.actor !== me.id || previous.product !== product.id)
          fail("So‘rov mos emas");
        return { ok: true };
      }
      if (product.until <= Date.now())
        fail("Avval mahsulotning yangi muddatini belgilang");
      await transaction(async (session) => {
        const current = await db.collection("products").findOne(
          { id: product.id },
          { session },
        );
        if (!current) throw Error("Mahsulot topilmadi");
        const changed = await db.collection("products").updateOne(
          { id: product.id, stock: { $lte: 10000 - qty } },
          { $inc: { stock: qty } },
          { session },
        );
        if (!changed.modifiedCount) throw Error("invalid stock addition");
        if (current.stock === 0)
          await notifyStockAvailable(db, current, session);
        await db.collection("stock_events").insertOne(
          {
            id: key,
            product: product.id,
            actor: me.id,
            qty,
            created: Date.now(),
          },
          { session },
        );
        await incrementChanges(db, session);
      });
      return { ok: true };
    }
    const value = body.product;
    const price = int(value.price, 100, 100000000);
    const original = int(value.original, price + 1, 100000000);
    const until = int(
      value.until,
      Date.now() + 60000,
      Date.now() + 30 * 86400000,
    );
    const fresh = freshness(value, until);
    await transaction(async (session) => {
      const activeOrders = await db.collection("orders").findOne(
        {
          product: product.id,
          status: { $in: ["reserved", "pending_payment"] },
        },
        { session },
      );
      if (activeOrders)
        fail("Faol buyurtma bor. Avval uni topshiring yoki bekor qiling");
      await db.collection("products").updateOne(
        { id: product.id },
        {
          $set: {
            title: capitalize(str(value.title, 100)),
            price,
            original,
            until,
            allergens: str(value.allergens, 250),
            storage: str(value.storage, 250),
            prepared_at: fresh.prepared,
            best_before: fresh.best,
          },
        },
        { session },
      );
      await incrementChanges(db, session);
    });
    return { ok: true };
  }
  return null;
}

async function reorderPreview(db, me, id) {
  const order = await db.collection("orders").findOne({ id: String(id), buyer: me.id });
  if (!order) throw Error("Buyurtma topilmadi");
  const old = JSON.parse(order.cart_items || "[]");
  if (!old.length)
    old.push({ id: order.product, qty: order.qty, price: order.price });
  const items = [];
  const changes = [];
  for (const row of old) {
    const product = await db.collection("products").findOne({ id: row.id });
    const seller = product
      ? await db.collection("users").findOne({ id: product.owner })
      : null;
    if (
      !product ||
      !active(product.active) ||
      !seller ||
      product.stock < 1 ||
      product.until < Date.now() + MIN_CHECKOUT_WINDOW_MS ||
      seller?.selling_paused ||
      (product.best_before && product.best_before <= Date.now())
    ) {
      changes.push((row.title || "Mahsulot") + ": hozir mavjud emas");
      continue;
    }
    const qty = Math.min(row.qty, product.stock);
    items.push({ ...clean(product), selling_paused: seller.selling_paused, qty });
    if (qty !== row.qty || product.price !== row.price)
      changes.push(product.title + ": narx yoki miqdor yangilandi");
  }
  return { items, changes };
}

async function cashCheckoutMongo(db, me, body) {
  if (body.acceptTerms !== true) throw Error("Olib ketish shartini tasdiqlang");
  const id = String(body.requestId || "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id))
    throw Error("So‘rov identifikatori noto‘g‘ri");
  const input = body.items || [{ id: body.id, qty: Number(body.qty) }];
  const prior = await db.collection("orders").findOne({ id });
  const normalize = (items) =>
    JSON.stringify(
      items
        .map((item) => [item.id, item.qty])
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
  if (prior) {
    if (
      prior.buyer !== me.id ||
      prior.provider !== "cash" ||
      !Array.isArray(input) ||
      normalize(input) !== normalize(JSON.parse(prior.cart_items || "[]"))
    )
      throw Error("So‘rov mos emas");
    return { ok: true, id, receiptReady: true };
  }
  const cashOrders = await db
    .collection("orders")
    .countDocuments({
      buyer: me.id,
      provider: "cash",
      status: "reserved",
    });
  if (cashOrders >= 3)
    throw Error("Avval faol naqd buyurtmalaringizni olib keting yoki bekor qiling");
  const cart = await prepareCart(db, input, me.id);
  const product = cart.items[0];
  const partner = await db.collection("partner_businesses").findOne({
    owner: product.owner,
    enabled: { $in: [1, true] },
  });
  const seller = await db.collection("users").findOne({ id: product.owner });
  if (!partner || seller?.selling_paused)
    throw Error("Ushbu do‘kon uchun naqd to‘lov yoqilmagan");
  const now = Date.now();
  const order = {
    id,
    buyer: me.id,
    product: product.id,
    qty: 1,
    price: cart.total,
    code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    status: "reserved",
    created: now,
    payment_state: "cash_due",
    provider: "cash",
    deposit: 0,
    pickup_at: Math.min(now + 30 * 60000, cart.until),
    pickup_selected: 0,
    snapshot: JSON.stringify({
      title: cart.items.map((item) => item.title).join(", "),
      shop: product.shop,
      address: product.address,
      image: product.image,
      allergens: product.allergens,
      storage: product.storage,
      lat: product.lat,
      lng: product.lng,
      prepared_at: product.prepared_at,
      best_before: product.best_before,
      until: cart.until,
    }),
    terms_at: now,
    is_mock: 0,
    cart_items: JSON.stringify(cart.items),
    partner_id: partner.id,
    commission_rate: partner.rate_bps,
    commission_due: Math.ceil((cart.total * partner.rate_bps) / 10000),
  };
  await createOrderWithStock(db, order);
  return {
    ok: true,
    id,
    receiptReady: true,
    message: "Bron tayyor. To‘liq summa do‘konda naqd to‘lanadi.",
  };
}

async function dashboardProducts(db, me) {
  const pausedOwners = await db
    .collection("users")
    .distinct("id", { selling_paused: { $in: [1, true] } });
  const alternatives = [{ owner: me?.id || "" }];
  if (me?.role === "admin") alternatives.push({});
  else
    alternatives.push({
      active: { $in: [1, true] },
      owner: { $nin: pausedOwners },
      $or: [{ best_before: null }, { best_before: { $gt: Date.now() } }],
    });
  const rows = await db
    .collection("products")
    .find({ $or: alternatives })
    .sort({ created: -1 })
    .toArray();
  const owners = [...new Set(rows.map((product) => product.owner))];
  const [users, reviews] = await Promise.all([
    db
      .collection("users")
      .find(
        { id: { $in: owners } },
        { projection: { _id: 0, id: 1, verified: 1 } },
      )
      .toArray(),
    rows.length
      ? db
          .collection("reviews")
          .aggregate([
            {
              $match: {
                product: { $in: rows.map((product) => product.id) },
                hidden: { $in: [0, false] },
              },
            },
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
  const userById = new Map(users.map((row) => [row.id, row]));
  const reviewById = new Map(reviews.map((row) => [row._id, row]));
  return rows.filter((row) => userById.has(row.owner)).map((row) => ({
    ...clean(row),
    seller_verified: userById.get(row.owner)?.verified || 0,
    rating: reviewById.has(row.id)
      ? Math.round(reviewById.get(row.id).rating * 10) / 10
      : null,
    review_count: reviewById.get(row.id)?.review_count || 0,
  }));
}

async function dashboardOrders(db, me) {
  const ownedProducts = await db
    .collection("products")
    .distinct("id", { owner: me.id });
  const alternatives = [
    { buyer: me.id },
    ...(ownedProducts.length
      ? [{ product: { $in: ownedProducts } }]
      : []),
    ...(me.role === "admin" ? [{}] : []),
  ];
  const orderFilter = {
    ...(env.DEMO_MODE === "true" ? {} : { provider: { $ne: "demo" } }),
    $or: alternatives,
  };
  const orders = await db
    .collection("orders")
    .find(orderFilter)
    .sort({ created: -1 })
    .toArray();
  const productIds = [...new Set(orders.map((order) => order.product))];
  const buyerIds = [...new Set(orders.map((order) => order.buyer))];
  const [products, buyers, accounts] = await Promise.all([
    db.collection("products")
      .find(
        { id: { $in: productIds } },
        {
          projection: {
            _id: 0,
            id: 1,
            owner: 1,
            title: 1,
            shop: 1,
            address: 1,
            lat: 1,
            lng: 1,
            until: 1,
            image: 1,
          },
        },
      )
      .toArray(),
    db.collection("users")
      .find(
        { id: { $in: buyerIds } },
        { projection: { _id: 0, id: 1, name: 1 } },
      )
      .toArray(),
    db
      .collection("app_accounts")
      .find({ owner: { $in: buyerIds } }, { projection: { owner: 1, phone: 1 } })
      .toArray(),
  ]);
  const owners = new Map(products.map((product) => [product.id, product]));
  const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const phoneByOwner = new Map(accounts.map((account) => [account.owner, account.phone]));
  return orders
    .filter((order) => owners.has(order.product) && buyerById.has(order.buyer))
    .map((order) => {
    const product = owners.get(order.product);
    return {
      ...clean(order),
      title: product.title,
      shop: product.shop,
      address: product.address,
      lat: product.lat,
      lng: product.lng,
      until: product.until,
      image: product.image,
      owner: product.owner,
      buyerName: buyerById.get(order.buyer)?.name,
      buyerPhone: phoneByOwner.get(order.buyer),
    };
  });
}

export async function GET(req) {
  try {
    const db = await getMongoDb();
    await expireOrders(db);
    const me = await user(db);
    const catalogRequest =
      req && new URL(req.url).searchParams.get("catalog") === "1";
    const products = catalogRequest ? [] : await dashboardProducts(db, me);
    const orders = me ? await dashboardOrders(db, me) : [];
    const extra = await growthData(db, me);
    const page = catalogRequest
      ? await catalog(db, new URL(req.url).searchParams)
      : null;
    return json({
      ...extra,
      demo: mockPayments(env),
      me,
      products: page?.products || products,
      pagination: page
        ? { page: page.page, pages: page.pages, total: page.total }
        : null,
      orders: orders.map((order) => ({
        ...order,
        ...JSON.parse(order.snapshot || "{}"),
        items: JSON.parse(order.cart_items || "[]"),
        code: order.buyer === me?.id ? order.code : undefined,
        buyerPhone:
          order.owner === me?.id &&
          ["paid", "test", "cash_due", "cash_paid"].includes(
            order.payment_state,
          )
            ? order.buyerPhone
            : undefined,
      })),
      now: Date.now(),
    });
  } catch (e) {
    logError("GET /api/data", e);
    if (mongoUnavailable(e)) return json({ error: MONGO_HINT }, 503);
    return json({ error: "Ma’lumotlarni yuklab bo‘lmadi" }, 500);
  }
}

export async function POST(req) {
  try {
    const appAuthorization = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (
      req.headers.get("origin") !== new URL(req.url).origin &&
      !(
        !req.headers.get("origin") &&
        req.headers.get("x-client") === "app" &&
        /^[a-f0-9]{64}$/.test(appAuthorization || "")
      )
    )
      return json({ error: "Origin ruxsat etilmagan" }, 403);
    const db = await getMongoDb();
    const me = await user(db);
    if (!me) return json({ error: "Avval hisobingizga kiring" }, 401);
    await expireOrders(db);
    const b = await req.json();
    if (
      [
        "quickDay",
        "create",
        "checkout",
        "demoCheckout",
        "restock",
        "editProduct",
        "replaceImage",
      ].includes(b.action) &&
      env.SMS_REQUIRED === "true" &&
      !(await phoneVerified(db, me.id))
    )
      return json(
        { error: "Avval telefonni SMS bilan tasdiqlang / Подтвердите телефон" },
        403,
      );
    if (
      sellerActions.has(b.action) &&
      !canSell(me.role) &&
      !(me.role === "admin" && ["collect", "toggle"].includes(b.action))
    )
      return json({ error: "Bu amal faqat sotuvchi uchun" }, 403);
    if (
      me.selling_paused &&
      [
        "create",
        "quickDay",
        "restock",
        "editProduct",
        "replaceImage",
        "toggle",
      ].includes(b.action)
    )
      return json(
        {
          error:
            "Yangi savdo vaqtincha to‘xtatilgan. Mavjud buyurtmalarni topshirishingiz mumkin.",
        },
        403,
      );
    if (b.action === "reorderPreview")
      return json(await reorderPreview(db, me, b.id));
    if (b.action === "checkout" && b.provider === "cash")
      return json(await cashCheckoutMongo(db, me, b));
    const growth = await growthAction(db, me, b);
    if (growth) return json(growth);
    const str = (value, n = 250) =>
      typeof value === "string" && value.trim().length > 0 && value.length <= n
        ? value.trim()
        : fail("Maydonlarni to‘liq va to‘g‘ri kiriting");
    const int = (value, min, max) =>
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= min &&
      Number(value) <= max
        ? Number(value)
        : fail("Son noto‘g‘ri");
    if (b.action === "quickDay") {
      if (me.role !== "seller") return json({ error: "Faqat sotuvchi" }, 403);
      const product = await db
        .collection("products")
        .findOne({ id: str(b.id), owner: me.id });
      if (!product || !["approved", "legacy"].includes(product.image_status))
        fail("Tasdiqlangan mahsulotni tanlang");
      const qty = int(b.qty, 1, 10000);
      const price = int(b.price, 100, product.original - 1);
      const until = Number(b.until);
      const id = str(b.requestId, 80);
      if (
        !Number.isFinite(until) ||
        until <= Date.now() + 600000 ||
        until > Date.now() + 86400000
      )
        fail("Olish muddatini kelgusi 24 soat ichida belgilang");
      const prior = await db.collection("stock_events").findOne({ id });
      if (prior) {
        if (prior.actor !== me.id || prior.product !== product.id)
          fail("So‘rov mos emas");
        return json({ ok: true, message: "Bugungi taklif avval saqlangan" });
      }
      const fresh = freshness(b, until);
      await transaction(async (session) => {
        const current = await db.collection("products").findOne(
          { id: product.id, owner: me.id },
          { session },
        );
        if (!current) fail("Tasdiqlangan mahsulotni tanlang");
        await db.collection("stock_events").insertOne(
          { id, product: product.id, actor: me.id, qty, created: Date.now() },
          { session },
        );
        const stocked = await db.collection("products").updateOne(
          {
            id: product.id,
            owner: me.id,
            stock: { $lte: 10000 - qty },
          },
          { $inc: { stock: qty } },
          { session },
        );
        if (!stocked.modifiedCount) throw Error("invalid stock addition");
        await incrementChanges(db, session);
        if (current.stock === 0)
          await notifyStockAvailable(db, current, session);
        await db.collection("products").updateOne(
          { id: product.id, owner: me.id },
          {
            $set: {
              price,
              until,
              prepared_at: fresh.prepared,
              best_before: fresh.best,
              active: 1,
            },
          },
          { session },
        );
        await incrementChanges(db, session);
      });
      return json({ ok: true, message: "Bugungi taklif tayyor" });
    }
    if (b.action === "create") {
      const p = b.product;
      const id = b.requestId || crypto.randomUUID();
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(id))
        fail("So‘rov identifikatori noto‘g‘ri");
      const prior = await db.collection("products").findOne({ id });
      if (prior) {
        if (prior.owner !== me.id) return json({ error: "Ruxsat yo‘q" }, 403);
        return json({
          ok: true,
          id,
          message: "Mahsulot avval joylangan. Ikkinchi e’lon yaratilmadi.",
        });
      }
      const price = int(p.price, 100, 100000000);
      const original = int(p.original, price + 1, 100000000);
      if (
        !Number.isFinite(p.lat) ||
        !Number.isFinite(p.lng) ||
        Math.abs(p.lat) > 90 ||
        Math.abs(p.lng) > 180
      )
        fail("Xaritadan manzil belgilang");
      if (!p.image?.startsWith("/api/image?id="))
        fail("Mahsulot rasmini yuklang");
      const key = p.image.split("=")[1];
      if (
        !key.startsWith(me.id + "/") ||
        !(await db.collection("uploaded_files").findOne(
          { key },
          { projection: { _id: 1 } },
        ))
      )
        fail("Rasm topilmadi");
      const imageReview = await db.collection("image_checks").findOne({
        key,
        owner: me.id,
      });
      if (!imageReview || imageReview.status === "rejected")
        fail("Rasmni qayta yuklang");
      const images = Array.isArray(p.images)
        ? [...new Set([p.image, ...p.images])]
        : [p.image];
      if (images.length > 3) fail("3 tagacha rasm");
      for (const image of images) {
        const imageKey = String(image).slice(14);
        if (
          !String(image).startsWith("/api/image?id=") ||
          !imageKey.startsWith(me.id + "/") ||
          !(await db.collection("uploaded_files").findOne(
            { key: imageKey },
            { projection: { _id: 1 } },
          ))
        )
          fail("Rasm sizga tegishli emas");
        const check = await db.collection("image_checks").findOne({
          key: imageKey,
          owner: me.id,
        });
        if (!check || check.status === "rejected") fail("Rasm rad etilgan");
        if (check.status !== "approved") imageReview.status = "pending";
      }
      const city = p.city || "Toshkent";
      if (!(await db.collection("cities").findOne({ name: city })))
        fail("Shahar noto‘g‘ri");
      const until = Number(p.until);
      if (
        !Number.isFinite(until) ||
        until <= Date.now() ||
        until > Date.now() + 30 * 86400000
      )
        fail("Olib ketish vaqtini kelgusi 30 kun ichida belgilang");
      const fresh = freshness(p, until);
      const product = {
        id,
        owner: me.id,
        title: capitalize(str(p.title, 100)),
        shop: str(p.shop, 100),
        category: str(p.category, 50),
        image: p.image,
        price,
        original,
        stock: int(p.stock, 1, 10000),
        address: str(p.address, 500),
        lat: p.lat,
        lng: p.lng,
        allergens: str(p.allergens),
        storage: str(p.storage),
        until,
        active: imageReview.status === "approved" ? 1 : 0,
        image_status: imageReview.status,
        image_note: imageReview.note,
        created: Date.now(),
        city,
        images: JSON.stringify(images),
        prepared_at: fresh.prepared,
        best_before: fresh.best,
      };
      await transaction(async (session) => {
        await db.collection("products").insertOne(product, { session });
        if (Number.isSafeInteger(b.draftVersion) && b.draftVersion > 0)
          await db.collection("listing_drafts").deleteOne(
            { id, owner: me.id, version: b.draftVersion },
            { session },
          );
        await incrementChanges(db, session);
      });
      return json({
        ok: true,
        id,
        message:
          imageReview.status === "approved"
            ? "Mahsulot joylandi"
            : "Mahsulot saqlandi. Rasm admin tekshiruvini kutmoqda",
      });
    }
    if (b.action === "replaceImage") {
      const product = await db
        .collection("products")
        .findOne({ id: str(b.id) });
      if (!product || product.owner !== me.id)
        return json({ error: "Ruxsat yo‘q" }, 403);
      const image = str(b.image, 250);
      if (!image.startsWith("/api/image?id=")) fail("Rasm noto‘g‘ri");
      const key = image.slice(14);
      const check = await db.collection("image_checks").findOne({
        key,
        owner: me.id,
      });
      if (
        !check ||
        check.status === "rejected" ||
        !(await db.collection("uploaded_files").findOne(
          { key },
          { projection: { _id: 1 } },
        ))
      )
        fail("Rasmni qayta yuklang");
      await transaction(async (session) => {
        const activeOrder = await db.collection("orders").findOne(
          {
            product: product.id,
            status: { $in: ["reserved", "pending_payment"] },
          },
          { session },
        );
        if (activeOrder)
          fail("Faol buyurtma bor. Avval uni yakunlang");
        await db.collection("products").updateOne(
          { id: product.id },
          {
            $set: {
              image,
              image_status: check.status,
              image_note: check.note,
              active: check.status === "approved" ? 1 : 0,
            },
          },
          { session },
        );
        await incrementChanges(db, session);
      });
      return json({ ok: true, message: check.note });
    }
    if (b.action === "reviewImage") {
      if (me.role !== "admin") return json({ error: "Faqat admin uchun" }, 403);
      if (typeof b.approved !== "boolean") fail("Amal noto‘g‘ri");
      const id = str(b.id);
      await transaction(async (session) => {
        const product = await db.collection("products").findOne({ id }, { session });
        const activeOrder = await db.collection("orders").findOne(
          { product: id, status: { $in: ["reserved", "pending_payment"] } },
          { session },
        );
        if (!product || activeOrder)
          fail("Mahsulot topilmadi yoki faol buyurtma bor");
        await db.collection("products").updateOne(
          { id },
          {
            $set: {
              image_status: b.approved ? "approved" : "rejected",
              image_note: b.approved
                ? "Rasm admin tomonidan tekshirildi"
                : "Iltimos, mahsulotning aniq va to‘g‘ri rasmini yuklang",
              active: b.approved ? 1 : 0,
            },
          },
          { session },
        );
        await incrementChanges(db, session);
      });
      return json({ ok: true });
    }
    if (b.action === "reserve")
      return json(
        {
          error:
            "10% to‘lov bosqichidan foydalaning. Click va Payme hali ulanmagan.",
        },
        409,
      );
    if (b.action === "checkout") {
      let cart = null;
      if (b.items) {
        const prior = await db.collection("orders").findOne({
          id: String(b.requestId || ""),
          buyer: me.id,
        });
        if (prior) {
          const items = JSON.parse(prior.cart_items || "[]");
          const normalized = (value) =>
            JSON.stringify(
              value
                .map((item) => [item.id, item.qty])
                .sort((a, c) => a[0].localeCompare(c[0])),
            );
          if (
            !Array.isArray(b.items) ||
            !items.length ||
            normalized(items) !== normalized(b.items)
          )
            fail("So‘rov mos emas");
          cart = {
            items,
            total: prior.price,
            until: Math.min(...items.map((item) => item.until)),
          };
        } else cart = await prepareCart(db, b.items, me.id);
      }
      if (cart) {
        b.id = cart.items[0].id;
        b.qty = 1;
      }
      const mock = mockPayments(env);
      const method = b.provider;
      if (mock && b.provider === "card") b.provider = "payme";
      if (
        b.provider === "card" &&
        !(await throttle(db, "card-pay:" + me.id, 20, 60000))
      )
        return json({ error: "Bir oz kuting" }, 429);
      if (
        !paymentConfig(env)[b.provider] ||
        !["payme", "click", "card"].includes(b.provider)
      )
        return json(
          { error: "To‘lov xizmati hali sozlanmagan. Pul olinmadi." },
          503,
        );
      if (b.provider === "card" && !mock)
        return json(
          { error: "To‘lov xizmati hali sozlanmagan. Pul olinmadi." },
          503,
        );
      if (b.acceptTerms !== true) fail("Olib ketish shartini tasdiqlang");
      if (
        mock &&
        method === "card" &&
        !(await db.collection("demo_wallet").findOne({
          id: String(b.cardId || ""),
          owner: me.id,
        }))
      )
        return json({ error: "O‘z sinov kartangizni tanlang" }, 400);
      if (
        b.provider === "card" &&
        !(await db.collection("saved_cards").findOne({
          id: String(b.cardId || ""),
          owner: me.id,
        }))
      )
        return json({ error: "Avval o‘z kartangizni qo‘shing" }, 400);
      const qty = int(b.qty, 1, 1000);
      const id = str(b.requestId, 80);
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(id))
        fail("So‘rov identifikatori noto‘g‘ri");
      let order = await db.collection("orders").findOne({ id });
      if (order) {
        if (
          order.buyer !== me.id ||
          order.product !== b.id ||
          order.qty !== qty ||
          order.provider !== b.provider ||
          (cart &&
            JSON.stringify(cart.items.map((item) => [item.id, item.qty])) !==
              JSON.stringify(
                JSON.parse(order.cart_items || "[]").map((item) => [
                  item.id,
                  item.qty,
                ]),
              ))
        )
          fail("So‘rov mos emas");
        if (
          b.provider !== "card" &&
          (order.status !== "pending_payment" ||
            order.payment_state !== "unpaid" ||
            order.hold_until <= Date.now())
        )
          fail("Buyurtma faol emas. Yangi buyurtma oching");
      } else {
        const product = await db.collection("products").findOne({
          id: str(b.id),
        });
        if (!product || !active(product.active))
          fail("Mahsulot endi mavjud emas");
        if (product.stock < qty)
          fail(`Qoldiq yetarli emas. Hozir ${product.stock} dona qoldi`);
        if (product.until < Date.now() + MIN_CHECKOUT_WINDOW_MS)
          fail(
            "Taklif tugashiga 10 daqiqadan kam qoldi. Boshqa mahsulot tanlang",
          );
        const now = Date.now();
        const deposit = splitTotal(cart?.total ?? product.price, qty).deposit;
        order = {
          id,
          buyer: me.id,
          product: product.id,
          qty,
          price: cart?.total ?? product.price,
          code: crypto.randomUUID().slice(0, 8).toUpperCase(),
          status: "pending_payment",
          created: now,
          payment_state: "unpaid",
          provider: b.provider,
          deposit,
          hold_until: now + 5 * 60000,
          snapshot: JSON.stringify({
            title: cart
              ? cart.items.map((item) => item.title).join(", ")
              : product.title,
            shop: product.shop,
            address: product.address,
            image: product.image,
            allergens: product.allergens,
            storage: product.storage,
            prepared_at: product.prepared_at,
            best_before: product.best_before,
            lat: product.lat,
            lng: product.lng,
            until: cart?.until ?? product.until,
          }),
          terms_at: now,
          is_mock: mock ? 1 : 0,
          mock_method: mock ? method : null,
          cart_items: JSON.stringify(cart?.items || []),
        };
        await createOrderWithStock(db, order);
      }
      if (mock)
        return json({
          ok: true,
          id,
          redirect: "/mock-payment?id=" + encodeURIComponent(id),
        });
      return json({
        ok: true,
        id,
        redirect: paymentUrl(
          env,
          b.provider,
          id,
          order.deposit,
          new URL(req.url).origin,
        ),
      });
    }
    if (b.action === "demoCheckout")
      return json({ error: "Yangi checkout oqimidan foydalaning" }, 410);
    if (b.action === "schedule") {
      const order = await db.collection("orders").findOne({ id: str(b.id) });
      if (!order || order.buyer !== me.id)
        return json({ error: "Ruxsat yo‘q" }, 403);
      const product = await db.collection("products").findOne({
        id: order.product,
      });
      if (
        order.status !== "reserved" ||
        !["paid", "test", "cash_due", "cash_paid"].includes(
          order.payment_state,
        ) ||
        order.pickup_selected
      )
        fail("Olib ketish vaqti allaqachon belgilangan yoki buyurtma faol emas");
      const at = Number(b.pickupAt);
      const now = Date.now();
      if (
        !Number.isSafeInteger(at) ||
        at < now + 5 * 60000 - 2000 ||
        at > Math.min((order.paid_at || order.created) + 120 * 60000, product.until)
      )
        fail(
          "Vaqt hozirdan kamida 5 daqiqa keyin, to‘lovdan 2 soat ichida va e’lon muddatidan oldin bo‘lsin",
        );
      const changed = await updateOrder(
        db,
        order.id,
        { pickup_at: at, pickup_selected: 1 },
        { now, filter: { status: "reserved", pickup_selected: 0, pickup_at: { $gt: now } } },
      );
      if (!changed) fail("Buyurtma holati o‘zgardi");
      return json({ ok: true });
    }
    if (
      b.action === "collect" &&
      !(await throttle(db, "collect:" + me.id, 10, 60000))
    )
      return json({ error: "Bir oz kuting / Подождите" }, 429);
    if (b.action === "cancel" || b.action === "collect") {
      const order = await db.collection("orders").findOne({ id: str(b.id) });
      const product = order
        ? await db.collection("products").findOne({ id: order.product })
        : null;
      if (!order) fail("Buyurtma topilmadi");
      if (b.action === "cancel") {
        if (
          order.buyer !== me.id &&
          product?.owner !== me.id &&
          me.role !== "admin"
        )
          return json({ error: "Ruxsat yo‘q" }, 403);
        const paymentState = ["paid", "test"].includes(order.payment_state)
          ? "refund_due"
          : order.payment_state;
        const changed = await updateOrder(
          db,
          order.id,
          { status: "cancelled", payment_state: paymentState },
          {
            filter: {
              status: { $in: ["reserved", "pending_payment"] },
            },
          },
        );
        if (order.is_mock && ["test", "paid"].includes(order.payment_state)) {
          if (!changed) fail("Qaytarish kutilmayapti");
          await updateOrder(
            db,
            order.id,
            { payment_state: "refunded" },
            { filter: { status: "cancelled", payment_state: "refund_due" } },
          );
        }
      } else {
        if (product?.owner !== me.id && me.role !== "admin")
          return json({ error: "Ruxsat yo‘q" }, 403);
        if (order.pickup_at && order.pickup_at <= Date.now())
          fail("Olib ketish muddati tugagan");
        if (
          order.status !== "reserved" ||
          !["paid", "test", "cash_due", "legacy"].includes(order.payment_state)
        )
          fail(
            "Buyurtma allaqachon yakunlangan yoki qaytarish kutilmoqda",
          );
        if (String(b.code).trim().toUpperCase() !== order.code)
          fail("Topshirish kodi noto‘g‘ri");
        if (order.provider === "cash" && b.cashReceived !== true)
          fail("To‘liq naqd pulni olganingizni tasdiqlang");
        const now = Date.now();
        const update = {
          status: "collected",
          ...(order.provider === "cash"
            ? { payment_state: "cash_paid", paid_at: now }
            : {}),
        };
        await updateOrder(
          db,
          order.id,
          update,
          {
            now,
            filter: { status: "reserved", pickup_at: { $gt: now } },
            afterUpdate:
              order.provider === "cash"
                ? async (session, updated, product) => {
                    await db.collection("partner_ledger").insertOne(
                      {
                        id: "sale-" + updated.id,
                        partner_id: updated.partner_id,
                        kind: "commission",
                        amount: updated.commission_due,
                        order_id: updated.id,
                        actor: product.owner,
                        reference: "",
                        created: updated.paid_at,
                      },
                      { session },
                    );
                  }
                : undefined,
          },
        );
      }
      return json({ ok: true });
    }
    if (b.action === "toggle") {
      const product = await db
        .collection("products")
        .findOne({ id: str(b.id) });
      if (!product || (product.owner !== me.id && me.role !== "admin"))
        return json({ error: "Ruxsat yo‘q" }, 403);
      if (!["approved", "legacy"].includes(product.image_status))
        fail("Rasm avval admin tomonidan tasdiqlanishi kerak");
        await transaction(async (session) => {
          await db.collection("products").updateOne(
            { id: product.id },
            { $set: { active: active(product.active) ? 0 : 1 } },
            { session },
          );
          await incrementChanges(db, session);
        });
      return json({ ok: true });
    }
    return json({ error: "Noma’lum amal" }, 400);
  } catch (e) {
    logError("POST /api/data", e);
    if (mongoUnavailable(e)) return json({ error: MONGO_HINT }, 503);
    return json(
      {
        error: /stock|constraint/i.test(e.message)
          ? "Mahsulot qoldig‘i yetarli emas"
          : e.message?.startsWith("D1")
            ? "Amal bajarilmadi. Qayta urinib ko‘ring"
            : e.message,
      },
      400,
    );
  }
}
