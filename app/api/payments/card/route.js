import { env } from "../../../../lib/runtime-env.js";
import { getAppUser, sameOrigin, throttle } from "../../../../lib/auth.js";
import { cardsConfigured, subscribe } from "../../../../lib/payme-subscribe.js";
import { getMongoDb } from "../../../../lib/mongodb.js";

const pending = (id) => ({
  ok: true,
  id,
  cardPayment: "pending",
  message:
    "Karta to‘lovi tekshirilmoqda. Qayta pul yechishga urinilmaydi. Buyurtmalarim bo‘limida holatni tekshiring.",
});

async function notify(db, session, owner, kind, entity, created) {
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
      },
    },
    { upsert: true, session },
  );
  if (result.upsertedCount)
    await db
      .collection("change_version")
      .updateOne({ id: 1 }, { $inc: { version: 1 } }, { session });
}

async function settle(db, order, charge, receipt) {
  const account = Array.isArray(receipt?.account)
    ? receipt.account.find((a) => a.name === "order_id")?.value
    : receipt?.account?.order_id;
  if (
    !receipt ||
    typeof receipt._id !== "string" ||
    receipt._id.length > 100 ||
    (charge.receipt_id && receipt._id !== charge.receipt_id) ||
    receipt.amount !== order.deposit * 100 ||
    String(account) !== order.id ||
    receipt.merchant?._id !== env.PAYME_SUBSCRIBE_ID ||
    (receipt.currency !== undefined && receipt.currency !== 860)
  )
    throw Error("Provayder javobi buyurtmaga mos emas");

  if (receipt.state === 4) {
    if (
      !Number.isSafeInteger(receipt.pay_time) ||
      receipt.pay_time < order.created - 60000 ||
      receipt.pay_time > Date.now() + 60000
    )
      throw Error("To‘lov vaqti noto‘g‘ri");
    const dbNow = Date.now();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const charged = await db.collection("card_charges").updateOne(
          { order_id: order.id, status: "paying" },
          {
            $set: {
              status: "paid",
              paid_at: receipt.pay_time,
              updated: dbNow,
            },
          },
          { session },
        );
        if (!charged.modifiedCount) return;
        const product = await db
          .collection("products")
          .findOne({ id: order.product }, { session });
        const current = await db
          .collection("orders")
          .findOne({ id: order.id }, { session });
        if (!current) throw Error("Buyurtma topilmadi");
        const paymentState = "paid";
        const deadlinePassed = product?.until <= dbNow;
        const update = await db.collection("orders").updateOne(
          { id: order.id },
          {
            $set: {
              payment_state: deadlinePassed ? "refund_due" : paymentState,
              transaction_id: "subscribe:" + receipt._id,
              paid_at: receipt.pay_time,
              status: deadlinePassed ? "cancelled" : "reserved",
              pickup_at: Math.min(dbNow + 1800000, product?.until ?? dbNow),
            },
          },
          { session },
        );
        if (!update.modifiedCount) throw Error("Buyurtma holati o‘zgardi");
        if (current.payment_state === "unpaid") {
          const counter = await db
            .collection("receipt_counters")
            .findOneAndUpdate(
              { kind: "paid" },
              { $inc: { value: 1 } },
              { upsert: true, returnDocument: "after", session },
            );
          await db
            .collection("orders")
            .updateOne(
              { id: order.id },
              { $set: { receipt_no: counter.value } },
              { session },
            );
        }
        const buyer = await db
          .collection("users")
          .findOne({ id: current.buyer }, { projection: { id: 1 }, session });
        const seller = product
          ? await db
              .collection("users")
              .findOne(
                { id: product.owner },
                { projection: { id: 1 }, session },
              )
          : null;
        if (current.payment_state === "unpaid") {
          await notify(
            db,
            session,
            buyer?.id,
            "paid",
            order.id,
            receipt.pay_time,
          );
          await notify(
            db,
            session,
            seller?.id,
            "paid",
            order.id,
            receipt.pay_time,
          );
        }
        if (deadlinePassed) {
          await db
            .collection("products")
            .updateOne(
              { id: current.product },
              { $inc: { stock: current.qty } },
              { session },
            );
          await notify(db, session, buyer?.id, "cancelled", order.id, dbNow);
          await notify(db, session, seller?.id, "cancelled", order.id, dbNow);
          await notify(db, session, buyer?.id, "refunded", order.id, dbNow);
        }
        await db.collection("change_version").updateOne(
          { id: 1 },
          {
            $inc: {
              version:
                1 +
                (current.payment_state === "unpaid" ? 1 : 0) +
                (deadlinePassed ? 2 : 0),
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    const settled = await db.collection("orders").findOne({ id: order.id });
    return {
      ok: true,
      id: order.id,
      cardPayment: "paid",
      message:
        settled?.payment_state === "refund_due"
          ? "To‘lov tasdiqlandi, lekin mahsulot muddati o‘tgan. Qaytarish uchun qayd ochildi."
          : "10% to‘lov tasdiqlandi. Buyurtma cheki tayyor.",
    };
  }
  if (receipt.state === 50) {
    const now = Date.now();
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await db
          .collection("card_charges")
          .updateOne(
            { order_id: order.id, status: "paying" },
            { $set: { status: "failed", updated: now } },
            { session },
          );
        if (!changed.modifiedCount) return;
        const current = await db
          .collection("orders")
          .findOneAndUpdate(
            { id: order.id, status: "pending_payment" },
            { $set: { status: "cancelled" } },
            { returnDocument: "before", session },
          );
        if (!current) return;
        await db
          .collection("products")
          .updateOne(
            { id: current.product },
            { $inc: { stock: current.qty } },
            { session },
          );
        const product = await db
          .collection("products")
          .findOne({ id: current.product }, { session });
        await notify(db, session, current.buyer, "cancelled", order.id, now);
        await notify(db, session, product?.owner, "cancelled", order.id, now);
        await db
          .collection("change_version")
          .updateOne({ id: 1 }, { $inc: { version: 2 } }, { session });
      });
    } finally {
      await session.endSession();
    }
    return {
      ok: true,
      id: order.id,
      cardPayment: "failed",
      message:
        "Provayder to‘lov bekor qilinganini tasdiqladi. Qoldiq qaytarildi.",
    };
  }
  return pending(order.id);
}

async function reconcile(db, owner, id, admin = false) {
  const order = await db
    .collection("orders")
    .aggregate([
      { $match: { id } },
      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "id",
          as: "product_record",
        },
      },
      { $unwind: "$product_record" },
      { $set: { until: "$product_record.until" } },
      { $unset: "product_record" },
    ])
    .next();
  if (!order || (!admin && order.buyer !== owner) || order.provider !== "card")
    throw Error("Buyurtma topilmadi yoki ruxsat yo‘q");
  const charge = await db.collection("card_charges").findOne({ order_id: id });
  if (charge?.status === "paid")
    return {
      ok: true,
      id,
      cardPayment: "paid",
      message: "To‘lov avval tasdiqlangan. Yangi pul yechilmadi.",
    };
  if (charge?.status === "failed")
    return {
      ok: true,
      id,
      cardPayment: "failed",
      message: "Karta to‘lovi yakunlanmagan. Yangi buyurtma oching.",
    };
  if (!charge?.receipt_id || charge.status !== "paying") return pending(id);
  try {
    const { receipt } = await subscribe(env, "receipts.get", {
      id: charge.receipt_id,
    });
    return await settle(db, order, charge, receipt);
  } catch {
    return pending(id);
  }
}

export async function POST(req) {
  if (!sameOrigin(req))
    return Response.json({ error: "Ruxsat yoвЂq" }, { status: 403 });
  const user = await getAppUser();
  if (!user) return Response.json({ error: "Hisobga kiring" }, { status: 401 });
  if (!cardsConfigured(env))
    return Response.json({ error: "Karta xizmati ulanmagan" }, { status: 503 });
  try {
    const db = await getMongoDb();
    if (!(await throttle(db, "card-status:" + user.userId, 20, 60000)))
      return Response.json({ error: "Bir oz kuting" }, { status: 429 });
    const body = await req.json();
    return Response.json(
      await reconcile(
        db,
        user.userId,
        String(body.id || ""),
        user.role === "admin",
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Buyurtma topilmadi yoki tekshirib boвЂlmadi" },
      { status: 400 },
    );
  }
}
