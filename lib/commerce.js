import { getMongoClient } from "./mongodb.js";

// Amounts are stored in whole UZS. No browser request can confirm a real payment.
export const MIN_CHECKOUT_WINDOW_MS = 10 * 60 * 1000;
export const splitTotal = (price, qty) => {
  const total = price * qty;
  const deposit = Math.ceil(total / 10);
  return { total, deposit, balance: total - deposit };
};

async function transaction(db, work) {
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

export async function incrementChanges(db, session) {
  await db.collection("change_version").updateOne(
    { id: 1 },
    { $setOnInsert: { id: 1 }, $inc: { version: 1 } },
    { upsert: true, session },
  );
}

function findUpdatedDocument(result) {
  return result?.value && typeof result.value === "object"
    ? result.value
    : result;
}

async function notify(db, owner, kind, entity, created, session) {
  if (!owner) return;
  const result = await db.collection("notifications").updateOne(
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
  if (result.upsertedCount) await incrementChanges(db, session);
}

export async function notifyStockAvailable(db, product, session) {
  if (
    product.stock !== 0 ||
    !product.active ||
    product.until <= Date.now()
  )
    return;
  const waiters = await db
    .collection("waitlist")
    .find({ product: product.id }, { session })
    .toArray();
  const created = Date.now();
  for (const waiter of waiters)
    await notify(db, waiter.owner, "available", product.id, created, session);
  if (waiters.length)
    await db.collection("waitlist").deleteMany(
      { product: product.id },
      { session },
    );
}

async function notifyStatus(db, order, owner, kind, created, session) {
  await notify(db, order.buyer, kind, order.id, created, session);
  await notify(db, owner, kind, order.id, created, session);
}

function stockLines(order) {
  const items = JSON.parse(order.cart_items || "[]");
  return items.length
    ? items.map((item) => ({ id: item.id, qty: item.qty }))
    : [{ id: order.product, qty: order.qty }];
}

async function restoreOrderStock(db, order, session) {
  for (const item of stockLines(order)) {
    const products = db.collection("products");
    const previous = await products.findOne({ id: item.id }, { session });
    const restored = await db
      .collection("products")
      .updateOne({ id: item.id }, { $inc: { stock: item.qty } }, { session });
    if (restored.modifiedCount) {
      await incrementChanges(db, session);
      if (previous?.stock === 0)
        await notifyStockAvailable(db, { ...previous, id: item.id }, session);
    }
  }
}

async function recordOrderUpdate(db, oldOrder, newOrder, owner, session, now) {
  if (
    oldOrder.payment_state === "unpaid" &&
    ["test", "paid"].includes(newOrder.payment_state)
  ) {
    await notifyStatus(
      db,
      newOrder,
      owner,
      "paid",
      newOrder.paid_at || now,
      session,
    );
  }
  if (
    oldOrder.status !== newOrder.status &&
    ["cancelled", "collected", "expired", "payment_expired"].includes(
      newOrder.status,
    )
  ) {
    await notifyStatus(db, newOrder, owner, newOrder.status, now, session);
  }
  if (
    oldOrder.payment_state !== "refunded" &&
    newOrder.payment_state === "refunded"
  ) {
    await notify(db, newOrder.buyer, "refunded", newOrder.id, now, session);
  }
  await incrementChanges(db, session);
}

export async function createOrderWithStock(db, order) {
  return transaction(db, async (session) => {
    const products = db.collection("products");
    const users = db.collection("users");
    const cart = JSON.parse(order.cart_items || "[]");
    const lines = cart.length
      ? cart.map((item) => ({ id: item.id, qty: item.qty, price: item.price }))
      : [{ id: order.product, qty: order.qty, price: order.price }];
    if (!lines.length || !Number.isSafeInteger(order.qty) || order.qty < 1)
      throw Error("stock unavailable");
    if (lines[0].id !== order.product) throw Error("stock unavailable");
    if (cart.length && (order.qty !== 1 || order.price !== cart.reduce((n, i) => n + i.price * i.qty, 0)))
      throw Error("stock unavailable");

    let owner;
    for (const line of lines) {
      if (!Number.isSafeInteger(line.qty) || line.qty < 1)
        throw Error("stock unavailable");
      const product = await products.findOne({ id: line.id }, { session });
      if (
        !product ||
        !product.active ||
        product.stock < line.qty ||
        product.price !== line.price ||
        product.until < order.created + MIN_CHECKOUT_WINDOW_MS
      )
        throw Error("stock unavailable");
      const seller = await users.findOne({ id: product.owner }, { session });
      if (
        !seller ||
        seller.selling_paused ||
        (product.best_before != null && product.best_before <= order.created)
      )
        throw Error("stock unavailable");
      if (owner && owner !== product.owner) throw Error("stock unavailable");
      owner = product.owner;

      const updated = await products.updateOne(
        {
          id: line.id,
          active: { $in: [1, true] },
          stock: { $gte: line.qty },
          price: line.price,
          until: { $gt: order.created },
        },
        { $inc: { stock: -line.qty } },
        { session },
      );
      if (!updated.modifiedCount) throw Error("stock unavailable");
      await incrementChanges(db, session);
    }

    if (order.provider === "cash") {
      const activeCashOrders = await db.collection("orders").countDocuments(
        {
          buyer: order.buyer,
          provider: "cash",
          status: "reserved",
        },
        { session },
      );
      const partner = await db.collection("partner_businesses").findOne(
        { id: order.partner_id, enabled: { $in: [1, true] } },
        { session },
      );
      if (
        activeCashOrders >= 3 ||
        order.status !== "reserved" ||
        order.payment_state !== "cash_due" ||
        order.deposit !== 0 ||
        !partner ||
        partner.owner !== owner ||
        order.commission_rate !== partner.rate_bps ||
        order.commission_due !==
          Math.ceil((order.price * order.qty * partner.rate_bps) / 10000)
      )
        throw Error("cash partner unavailable");
      const counter = await db.collection("receipt_counters").findOneAndUpdate(
        { kind: "cash" },
        {
          $setOnInsert: { kind: "cash" },
          $inc: { value: 1 },
        },
        { upsert: true, returnDocument: "after", session },
      );
      order.receipt_no =
        "C-" + findUpdatedDocument(counter).value;
      await incrementChanges(db, session);
    }
    await db.collection("orders").insertOne(order, { session });
    await notify(db, owner, "new_order", order.id, order.created, session);
    await incrementChanges(db, session);
    return order;
  });
}

export async function updateOrder(
  db,
  id,
  update,
  { now = Date.now(), filter = {}, afterUpdate } = {},
) {
  return transaction(db, async (session) => {
    const orders = db.collection("orders");
    const oldOrder = await orders.findOne({ id, ...filter }, { session });
    if (!oldOrder) return null;
    const product = await db
      .collection("products")
      .findOne({ id: oldOrder.product }, { session });
    const newOrder = { ...oldOrder, ...update };
    const changed = await orders.updateOne(
      {
        ...filter,
        id,
        status: oldOrder.status,
        payment_state: oldOrder.payment_state,
      },
      { $set: update },
      { session },
    );
    if (!changed.modifiedCount) return null;

    if (
      oldOrder.status !== newOrder.status &&
      ["reserved", "pending_payment"].includes(oldOrder.status) &&
      ["cancelled", "expired", "payment_expired"].includes(newOrder.status)
    ) {
      await restoreOrderStock(db, oldOrder, session);
    }
    await recordOrderUpdate(
      db,
      oldOrder,
      newOrder,
      product?.owner,
      session,
      now,
    );
    if (afterUpdate) await afterUpdate(session, newOrder, product);
    return newOrder;
  });
}

export async function expireOrders(db, now = Date.now()) {
  return transaction(db, async (session) => {
    const orders = db.collection("orders");
    const pending = await orders
      .find(
        { status: "pending_payment", hold_until: { $lte: now } },
        { session },
      )
      .toArray();
    let expired = 0;
    for (const order of pending) {
      const paying = await db
        .collection("card_charges")
        .findOne({ order_id: order.id, status: "paying" }, { session });
      if (paying) continue;
      if (
        await updateOrderInSession(
          db,
          order,
          { status: "payment_expired" },
          now,
          session,
        )
      )
        expired++;
    }
    const reserved = await orders
      .find(
        {
          status: "reserved",
          payment_state: { $in: ["paid", "test", "cash_due"] },
          pickup_at: { $lte: now },
        },
        { session },
      )
      .toArray();
    for (const order of reserved) {
      if (
        await updateOrderInSession(
          db,
          order,
          { status: "expired" },
          now,
          session,
        )
      )
        expired++;
    }
    return expired;
  });
}

async function updateOrderInSession(db, oldOrder, update, now, session) {
  const newOrder = { ...oldOrder, ...update };
  const result = await db.collection("orders").updateOne(
    {
      id: oldOrder.id,
      status: oldOrder.status,
      payment_state: oldOrder.payment_state,
    },
    { $set: update },
    { session },
  );
  if (!result.modifiedCount) return false;
  const product = await db
    .collection("products")
    .findOne({ id: oldOrder.product }, { session });
  if (
    ["reserved", "pending_payment"].includes(oldOrder.status) &&
    ["cancelled", "expired", "payment_expired"].includes(newOrder.status)
  ) {
    await restoreOrderStock(db, oldOrder, session);
  }
  await recordOrderUpdate(
    db,
    oldOrder,
    newOrder,
    product?.owner,
    session,
    now,
  );
  return true;
}

// Call ONLY after an authenticated provider callback validates signature, amount,
// currency and order reference. Client redirects are never proof of payment.
export async function settleVerifiedPayment(
  db,
  { id, transactionId, amount, provider, test = false },
  now = Date.now(),
) {
  return transaction(db, async (session) => {
    const orders = db.collection("orders");
    const order = await orders.findOne(
      { id },
      { projection: { _id: 0 }, session },
    );
    const product = order
      ? await db
          .collection("products")
          .findOne(
            { id: order.product },
            { projection: { _id: 0 }, session },
          )
      : null;
    if (
      !order ||
      !product ||
      order.deposit !== amount ||
      order.provider !== provider
    )
      throw Error("To‘lov ma’lumotlari mos emas");
    if (order.payment_state !== "unpaid") {
      if (order.transaction_id === transactionId) return order;
      throw Error("Buyurtma uchun to‘lov allaqachon qayd etilgan");
    }
    if (
      order.status !== "pending_payment" ||
      order.hold_until <= now ||
      product.until <= now
    )
      throw Error(
        "Band qilish muddati tugagan. To‘lovni qaytarish tekshiruvi kerak",
      );
    const cart = JSON.parse(order.cart_items || "[]");
    const pickupDeadline = cart.length
      ? Math.min(...cart.map((item) => item.until))
      : product.until;
    const update = {
      payment_state: test ? "test" : "paid",
      transaction_id: transactionId,
      paid_at: now,
      status: "reserved",
      pickup_at: Math.min(now + 30 * 60000, pickupDeadline),
    };
    const counter = await db.collection("receipt_counters").findOneAndUpdate(
      { kind: update.payment_state },
      {
        $setOnInsert: { kind: update.payment_state },
        $inc: { value: 1 },
      },
      { upsert: true, returnDocument: "after", session },
    );
    update.receipt_no = findUpdatedDocument(counter).value;
    const result = await orders.updateOne(
      {
        id,
        payment_state: "unpaid",
        status: "pending_payment",
        hold_until: { $gt: now },
      },
      { $set: update },
      { session },
    );
    if (!result.modifiedCount) throw Error("To‘lov holati o‘zgardi");
    await recordOrderUpdate(
      db,
      order,
      { ...order, ...update },
      product.owner,
      session,
      now,
    );
    await incrementChanges(db, session);
    return { ...order, ...update };
  });
}
