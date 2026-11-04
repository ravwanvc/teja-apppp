import { createHash } from "node:crypto";
import { mockPayments } from "../../../../lib/modes.js";
import { env } from "../../../../lib/runtime-env.js";
import { equal } from "../../../../lib/password.js";
import { getMongoDb } from "../../../../lib/mongodb.js";

function signature(params) {
  return createHash("md5")
    .update(
      String(params.click_trans_id) +
        params.service_id +
        env.CLICK_SECRET_KEY +
        params.merchant_trans_id +
        (String(params.action) === "1" ? params.merchant_prepare_id : "") +
        params.amount +
        params.action +
        params.sign_time,
    )
    .digest("hex");
}

const rpcError = (code, message) => {
  throw { code, message };
};
const txId = (provider, id) => provider + ":" + id;

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

async function getOrder(db, id, amount) {
  const order = await db.collection("orders").findOne({ id: String(id || "") });
  if (!order || order.provider !== "click")
    rpcError(-31050, "Buyurtma topilmadi");
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

async function findTransaction(db, id) {
  return db
    .collection("payment_transactions")
    .findOne({ id: txId("click", id) });
}

async function createTransaction(db, providerId, order) {
  const id = txId("click", providerId);
  try {
    await db.collection("payment_transactions").insertOne({
      id,
      provider: "click",
      provider_id: String(providerId),
      order_id: order.id,
      amount: order.deposit,
      provider_time: Date.now(),
      created: Date.now(),
      performed: null,
      cancelled: null,
      reason: null,
      state: 1,
    });
  } catch {
    const previous = await findTransaction(db, providerId);
    if (
      !previous ||
      previous.order_id !== order.id ||
      previous.amount !== order.deposit
    )
      rpcError(-31008, "Tranzaksiya allaqachon mavjud");
  }
  return findTransaction(db, providerId);
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
  const result = await findTransaction(db, tx.provider_id);
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
      if (!changed.modifiedCount || !order) return;
      const cancelOrder = ["pending_payment", "reserved"].includes(
        order.status,
      );
      const set = {};
      if (cancelOrder) set.status = "cancelled";
      if (current.state === 2) set.payment_state = "refunded";
      if (!Object.keys(set).length) return;
      await db
        .collection("orders")
        .updateOne({ id: order.id }, { $set: set }, { session });
      if (cancelOrder) {
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
        const now = Date.now();
        await notify(db, session, order.buyer, "cancelled", order.id, now);
        await notify(db, session, product?.owner, "cancelled", order.id, now);
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
          { $inc: { version: cancelOrder ? 2 : 1 } },
          { session },
        );
    });
  } catch (error) {
    if (error?.code) throw error;
    rpcError(-31007, "Mahsulot topshirilgan");
  } finally {
    await session.endSession();
  }
  return findTransaction(db, tx.provider_id);
}

async function callback(db, params) {
  const base = {
    click_trans_id: params.click_trans_id,
    merchant_trans_id: params.merchant_trans_id,
  };
  const fail = (code, note) => ({ ...base, error: code, error_note: note });
  try {
    if (
      !env.CLICK_SECRET_KEY ||
      String(params.service_id) !== String(env.CLICK_SERVICE_ID) ||
      !equal(signature(params), params.sign_string)
    )
      return fail(-1, "SIGN CHECK FAILED");
    if (!["0", "1"].includes(String(params.action)))
      return fail(-3, "Action not found");
    if (
      !/^\d+$/.test(String(params.click_trans_id)) ||
      !/^\d+(\.\d{1,2})?$/.test(String(params.amount))
    )
      return fail(-2, "Invalid amount");
    const order = await getOrder(
      db,
      params.merchant_trans_id,
      Number(params.amount),
    );
    let tx = await findTransaction(db, params.click_trans_id);
    if (tx && (tx.order_id !== order.id || tx.amount !== order.deposit))
      return fail(-6, "Transaction mismatch");
    if (String(params.action) === "0") {
      if (tx?.state === 2) return fail(-4, "Already paid");
      if (tx?.state < 0) return fail(-9, "Cancelled");
      canPay(order);
      if (Number(params.error) < 0) return fail(-9, "Cancelled");
      tx = tx || (await createTransaction(db, params.click_trans_id, order));
      return {
        ...base,
        merchant_prepare_id: tx.provider_id,
        error: 0,
        error_note: "Success",
      };
    }
    if (!tx || String(params.merchant_prepare_id) !== tx.provider_id)
      return fail(-6, "Transaction not found");
    if (Number(params.error) < 0) {
      await cancel(db, tx, Number(params.error));
      return fail(-9, "Cancelled");
    }
    if (tx.state === 2)
      return {
        ...base,
        merchant_confirm_id: tx.provider_id,
        error: 0,
        error_note: "Success",
      };
    if (tx.state < 0) return fail(-9, "Cancelled");
    tx = await perform(db, tx);
    return {
      ...base,
      merchant_confirm_id: tx.provider_id,
      error: 0,
      error_note: "Success",
    };
  } catch (error) {
    return fail(
      error.code === -31001 ? -2 : error.code === -31050 ? -5 : -9,
      "Payment could not be completed",
    );
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
    const params = Object.fromEntries(new URLSearchParams(await req.text()));
    const db = await getMongoDb();
    return Response.json(await callback(db, params), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: -8, error_note: "Invalid request" });
  }
}
