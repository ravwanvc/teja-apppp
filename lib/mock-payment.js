import { mockPayments } from "./modes.js";
import { paymeCallback, clickCallback, clickSignature } from "./payments.js";
import { getMongoDb } from "./mongodb.js";
import { updateOrder } from "./commerce.js";
// Ephemeral credentials exist only in this process and never authorize HTTP callbacks.
export async function simulatePayment(e, owner, id, outcome) {
  const db = await getMongoDb();
  if (!mockPayments(e)) throw Error("Sinov to‘lovlari o‘chirilgan");
  if (!["pay", "reject", "expire", "refund"].includes(outcome))
    throw Error("Amal noto‘g‘ri");
  const o = await db.collection("orders").findOne({ id, buyer: owner, is_mock: 1 });
  if (!o) throw Error("Buyurtma topilmadi");
  if (outcome === "expire") {
    await updateOrder(db, id, { status: "payment_expired" }, {
      filter: { status: "pending_payment", payment_state: "unpaid" },
    });
    return { ok: true, id };
  }
  const existing = await db.collection("payment_transactions").findOne({ order_id: id });
  const pid =
    existing?.provider_id ||
    (o.provider === "click"
      ? String(
          BigInt("0x" + crypto.randomUUID().replaceAll("-", "").slice(0, 12)),
        )
      : "mock-" + id);
  const credentials = {
    PAYME_MERCHANT_KEY: crypto.randomUUID(),
    CLICK_SECRET_KEY: crypto.randomUUID(),
    CLICK_SERVICE_ID: "mock",
  };
  if (o.provider === "click") {
    const base = {
      click_trans_id: pid,
      service_id: "mock",
      merchant_trans_id: id,
      amount: String(o.deposit),
      sign_time: String(Date.now()),
      error: "0",
    };
    const send = async (p) =>
      clickCallback(db, credentials, {
        ...p,
        sign_string: clickSignature(credentials, p),
      });
    if (!existing) {
      const r = await send({ ...base, action: "0" });
      if (r.error) throw Error(r.error_note);
    }
    const result = await send({
      ...base,
      action: "1",
      merchant_prepare_id: pid,
      error: outcome === "pay" ? "0" : "-9",
    });
    if (result.error && !(result.error === -9 && outcome !== "pay"))
      throw Error(result.error_note);
  } else {
    const send = (method, params) =>
      paymeCallback(
        db,
        credentials,
        "Basic " + btoa("Paycom:" + credentials.PAYME_MERCHANT_KEY),
        { id: 1, method, params },
      );
    if (!existing) {
      const r = await send("CreateTransaction", {
        id: pid,
        time: Date.now(),
        amount: o.deposit * 100,
        account: { order_id: id },
      });
      if (r.error) throw Error(r.error.message.uz);
    }
    const r = await send(
      outcome === "pay" ? "PerformTransaction" : "CancelTransaction",
      { id: pid, reason: 1 },
    );
    if (r.error) throw Error(r.error.message.uz);
  }
  return {
    ok: true,
    id,
    label: "SINOV — pul olinmagan / ТЕСТ — деньги не списаны",
  };
}
export async function refundMock(e, id) {
  const db = await getMongoDb();
  const o = await db.collection("orders").findOne({ id });
  if (!o?.is_mock || !mockPayments(e)) throw Error("Faqat sinov qaytarishi");
  if (o.payment_state === "refunded") return { ok: true };
  if (o.payment_state !== "refund_due") throw Error("Qaytarish kutilmayapti");
  return simulatePayment(e, o.buyer, id, "refund");
}
