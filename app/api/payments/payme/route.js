import { mockPayments } from "../../../../lib/modes.js";
import { env } from "../../../../lib/runtime-env.js";
import { equal } from "../../../../lib/password.js";
import { getMongoDb } from "../../../../lib/mongodb.js";

const rpcError = (code, message, data) => {
  throw {
    code,
    message: { uz: message, ru: message, en: message },
    ...(data ? { data } : {}),
  };
};
const txResult = (tx) => ({
  transaction: tx.order_id,
  create_time: tx.created,
  perform_time: tx.performed,
  cancel_time: tx.cancelled,
  state: tx.state,
  reason: tx.reason,
});
const transactionId = (provider, id) => provider + ":" + id;

async function notify(db, session, owner, kind, entity, created) {
  if (!owner) return;
  const result = await db.collection("notifications").updateOne(
    { owner, kind, entity },
    {
      $setOnInsert: { id: crypto.randomUUID(), owner, kind, entity, created },
    },
    { upsert: true, session },
  );
  if (result.upsertedCount)
    await db
      .collection("change_version")
      .updateOne({ id: 1 }, { $inc: { version: 1 } }, { session });
}

async function getOrder(db, id, amount, provider) {
  const order = await db.collection("orders").findOne({ id: String(id || "") });
  if (!order || order.provider !== provider)
    rpcError(-31050, "Buyurtma topilmadi", "order_id");
  if (order.deposit !== amount) rpcError(-31001, "Summa mos emas");
  return order;
}

function canPay(order) {
  if (
    order.payment_state !== "unpaid" ||
    order.status !== "pending_payment" ||
    order.hold_until <= Date.now()
  )
    rpcError(-31008, "Buyurtma faol emas");
}

async function findTransaction(db, provider, id) {
  return db.collection("payment_transactions").findOne({
    id: transactionId(provider, id),
  });
}

async function createTransaction(
  db,
  provider,
  providerId,
  order,
  providerTime,
) {
  const id = transactionId(provider, providerId);
  try {
    await db.collection("payment_transactions").insertOne({
      id,
      provider,
      provider_id: String(providerId),
      order_id: order.id,
      amount: order.deposit,
      provider_time: providerTime,
      created: Date.now(),
      performed: null,
      cancelled: null,
      reason: null,
      state: 1,
    });
  } catch {
    const previous = await findTransaction(db, provider, providerId);
    if (
      !previous ||
      previous.order_id !== order.id ||
      previous.amount !== order.deposit
    )
      rpcError(-31008, "Tranzaksiya allaqachon mavjud");
  }
  return findTransaction(db, provider, providerId);
}

async function perform(db, tx) {
  if (tx.state === 2) return tx;
  if (tx.state !== 1) rpcError(-31008, "Tranzaksiya bekor qilingan");
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const currentTx = await db
        .collection("payment_transactions")
        .findOne({ id: tx.id }, { session });
      if (currentTx?.state === 2) return;
      if (currentTx?.state !== 1)
        rpcError(-31008, "Tranzaksiya bekor qilingan");
      const order = await db
        .collection("orders")
        .findOne({ id: currentTx.order_id }, { session });
      const product =
        order &&
        (await db
          .collection("products")
          .findOne({ id: order.product }, { session }));
      const now = Date.now();
      if (
        !order ||
        !product ||
        order.status !== "pending_payment" ||
        order.payment_state !== "unpaid" ||
        order.provider !== currentTx.provider ||
        order.deposit !== currentTx.amount ||
        order.hold_until <= now ||
        product.until <= now
      )
        rpcError(-31008, "To‘lov muddati tugagan yoki buyurtma o‘zgargan");
      const changed = await db
        .collection("payment_transactions")
        .updateOne(
          { id: tx.id, state: 1 },
          { $set: { state: 2, performed: now } },
          { session },
        );
      if (!changed.modifiedCount)
        rpcError(-31008, "Tranzaksiya bekor qilingan");
      const state = order.is_mock === 1 ? "test" : "paid";
      const orderUpdate = await db.collection("orders").updateOne(
        {
          id: order.id,
          status: "pending_payment",
          payment_state: "unpaid",
          provider: currentTx.provider,
          deposit: currentTx.amount,
          hold_until: { $gt: now },
        },
        {
          $set: {
            payment_state: state,
            transaction_id: currentTx.id,
            paid_at: now,
            status: "reserved",
            pickup_at: Math.min(now + 1800000, product.until),
          },
        },
        { session },
      );
      if (!orderUpdate.modifiedCount)
        rpcError(-31008, "To‘lov muddati tugagan yoki buyurtma o‘zgargan");
      const counter = await db
        .collection("receipt_counters")
        .findOneAndUpdate(
          { kind: state },
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
      const seller = await db
        .collection("users")
        .findOne({ id: product.owner }, { projection: { id: 1 }, session });
      await notify(db, session, order.buyer, "paid", order.id, now);
      await notify(db, session, seller?.id, "paid", order.id, now);
      await db
        .collection("change_version")
        .updateOne({ id: 1 }, { $inc: { version: 2 } }, { session });
    });
  } catch (error) {
    if (error?.code) throw error;
    rpcError(-31008, "To‘lov muddati tugagan yoki buyurtma o‘zgargan");
  } finally {
    await session.endSession();
  }
  const result = await findTransaction(db, tx.provider, tx.provider_id);
  if (result?.state !== 2) rpcError(-31008, "Tranzaksiya bekor qilingan");
  return result;
}

async function cancel(db, tx, reason) {
  if (tx.state < 0) return tx;
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const current = await db
        .collection("payment_transactions")
        .findOne({ id: tx.id }, { session });
      if (!current || current.state < 0) return;
      const order = await db
        .collection("orders")
        .findOne({ id: current.order_id }, { session });
      if (order?.status === "collected")
        rpcError(-31007, "Mahsulot topshirilgan");
      const changed = await db.collection("payment_transactions").updateOne(
        { id: tx.id, state: { $gt: 0 } },
        {
          $set: {
            state: current.state === 2 ? -2 : -1,
            cancelled: Date.now(),
            reason,
          },
        },
        { session },
      );
      if (!changed.modifiedCount) return;
      if (!order) return;
      const shouldCancel = ["pending_payment", "reserved"].includes(
        order.status,
      );
      const set = {};
      if (shouldCancel) set.status = "cancelled";
      if (current.state === 2) set.payment_state = "refunded";
      if (Object.keys(set).length) {
        await db
          .collection("orders")
          .updateOne({ id: order.id }, { $set: set }, { session });
        if (shouldCancel) {
          await db
            .collection("products")
            .updateOne(
              { id: order.product },
              { $inc: { stock: order.qty } },
              { session },
            );
          const product = await db
            .collection("products")
            .findOne({ id: order.product }, { session });
          await notify(
            db,
            session,
            order.buyer,
            "cancelled",
            order.id,
            Date.now(),
          );
          await notify(
            db,
            session,
            product?.owner,
            "cancelled",
            order.id,
            Date.now(),
          );
        }
        if (current.state === 2)
          await notify(
            db,
            session,
            order.buyer,
            "refunded",
            order.id,
            Date.now(),
          );
        await db
          .collection("change_version")
          .updateOne(
            { id: 1 },
            { $inc: { version: shouldCancel ? 2 : 1 } },
            { session },
          );
      }
    });
  } catch (error) {
    if (error?.code) throw error;
    rpcError(-31007, "Mahsulot topshirilgan");
  } finally {
    await session.endSession();
  }
  return findTransaction(db, tx.provider, tx.provider_id);
}

async function callback(db, auth, body) {
  const id = body?.id ?? null;
  try {
    if (
      !env.PAYME_MERCHANT_KEY ||
      !equal(auth, "Basic " + btoa("Paycom:" + env.PAYME_MERCHANT_KEY))
    )
      rpcError(-32504, "Avtorizatsiya xatosi");
    const params = body.params || {};
    let result;
    let tx;
    if (
      ["CheckPerformTransaction", "CreateTransaction"].includes(body.method)
    ) {
      if (
        !Number.isSafeInteger(params.amount) ||
        params.amount <= 0 ||
        params.amount % 100
      )
        rpcError(-31001, "Summa noto‘g‘ri");
      const order = await getOrder(
        db,
        params.account?.order_id,
        params.amount / 100,
        "payme",
      );
      if (body.method === "CheckPerformTransaction") {
        canPay(order);
        result = { allow: true };
      } else {
        if (
          typeof params.id !== "string" ||
          params.id.length > 100 ||
          !Number.isSafeInteger(params.time)
        )
          rpcError(-32600, "So‘rov noto‘g‘ri");
        tx = await findTransaction(db, "payme", params.id);
        if (tx) {
          if (
            tx.order_id !== order.id ||
            tx.amount !== order.deposit ||
            tx.state < 0
          )
            rpcError(-31008, "Tranzaksiya mos emas");
        } else {
          canPay(order);
          tx = await createTransaction(
            db,
            "payme",
            params.id,
            order,
            params.time,
          );
        }
        result = {
          create_time: tx.created,
          transaction: tx.order_id,
          state: tx.state,
        };
      }
    } else if (body.method === "GetStatement") {
      if (
        !Number.isSafeInteger(params.from) ||
        !Number.isSafeInteger(params.to) ||
        params.to < params.from
      )
        rpcError(-32600, "Davr noto‘g‘ri");
      const rows = await db
        .collection("payment_transactions")
        .find({
          provider: "payme",
          provider_time: { $gte: params.from, $lte: params.to },
        })
        .sort({ provider_time: 1 })
        .toArray();
      result = {
        transactions: rows.map((row) => ({
          ...txResult(row),
          id: row.provider_id,
          time: row.provider_time,
          amount: row.amount * 100,
          account: { order_id: row.order_id },
        })),
      };
    } else if (
      ["PerformTransaction", "CancelTransaction", "CheckTransaction"].includes(
        body.method,
      )
    ) {
      tx = await findTransaction(db, "payme", params.id);
      if (!tx) rpcError(-31003, "Tranzaksiya topilmadi");
      if (body.method === "PerformTransaction") tx = await perform(db, tx);
      if (body.method === "CancelTransaction") {
        if (!Number.isSafeInteger(params.reason))
          rpcError(-32600, "Sabab noto‘g‘ri");
        tx = await cancel(db, tx, params.reason);
      }
      result = txResult(tx);
    } else rpcError(-32601, "Metod mavjud emas");
    return { jsonrpc: "2.0", id, result };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: error.code
        ? error
        : {
            code: -32400,
            message: {
              uz: "Tizim xatosi",
              ru: "System error",
              en: "System error",
            },
          },
    };
  }
}

export async function POST(req) {
  try {
    if (mockPayments(env))
      return Response.json(
        { error: "Live callbacks disabled" },
        { status: 410 },
      );
    if (Number(req.headers.get("content-length")) > 16384)
      return new Response(null, { status: 413 });
    const db = await getMongoDb();
    return Response.json(
      await callback(db, req.headers.get("authorization"), await req.json()),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({
      error: { code: -32700, message: "Parse error" },
      id: null,
    });
  }
}
