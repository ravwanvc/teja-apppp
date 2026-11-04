import { mockPayments } from "../../../lib/modes.js";
import { validExpiry } from "../../../lib/card-form.js";
import { env } from "../../../lib/runtime-env.js";
import { getMongoDb } from "../../../lib/mongodb.js";
import { getAppUser, sameOrigin, throttle } from "../../../lib/auth.js";
import { cardsConfigured, subscribe } from "../../../lib/payme-subscribe.js";
const reply = (v, s = 200) =>
  Response.json(v, { status: s, headers: { "Cache-Control": "no-store" } });
export async function GET() {
  const u = await getAppUser();
  if (!u) return reply({ error: "Hisobga kiring" }, 401);
  const db = await getMongoDb();
  if (mockPayments(env)) {
    const rows = await db.collection("demo_wallet").find(
      { owner: u.userId },
      { projection: { _id: 0, id: 1, brand: 1, last4: 1, expiry: 1 } },
    ).sort({ created: -1 }).toArray();
    return reply({
      demo: true,
      configured: true,
      cards: rows.map((c) => ({ ...c, number: "•••• •••• •••• " + c.last4 })),
    });
  }
  const cards = await db.collection("saved_cards").find(
    { owner: u.userId },
    { projection: { _id: 0, id: 1, number: 1, expiry: 1 } },
  ).sort({ created: -1 }).toArray();
  return reply({
    cards,
    configured: cardsConfigured(env),
    merchantId: cardsConfigured(env) ? env.PAYME_SUBSCRIBE_ID : null,
  });
}
export async function POST(req) {
  if (!sameOrigin(req)) return reply({ error: "Ruxsat yo‘q" }, 403);
  const u = await getAppUser();
  if (!u) return reply({ error: "Hisobga kiring" }, 401);
  const db = await getMongoDb();
  if (mockPayments(env)) return demoCard(req, u, db);
  if (!cardsConfigured(env))
    return reply(
      { error: "Payme Subscribe hali ulanmagan. Karta saqlanmadi." },
      503,
    );
  try {
    if (!(await throttle(db, "cards:" + u.userId, 12)))
      return reply({ error: "Keyinroq urinib ko‘ring" }, 429);
    const b = await req.json();
    if (Object.keys(b).some((k) => !["action", "token", "id"].includes(k)))
      return reply(
        { error: "Karta raqami, CVV yoki SMS kodini TEJA serveriga yubormang" },
        400,
      );
    if (b.action === "remove") {
      const c = await db.collection("saved_cards").findOne(
        { id: String(b.id || ""), owner: u.userId },
        { projection: { token: 1 } },
      );
      if (!c) return reply({ error: "Karta topilmadi" }, 404);
      if (
        await db.collection("card_charges").aggregate([
          { $match: { card_id: String(b.id), status: { $in: ["creating", "created", "paying"] } } },
          { $lookup: { from: "orders", localField: "order_id", foreignField: "id", as: "order" } },
          { $match: { "order.status": "pending_payment" } },
          { $limit: 1 },
        ]).next()
      )
        return reply(
          {
            error:
              "Bu karta bilan to‘lov tekshirilmoqda. Avval buyurtma holatini tekshiring.",
          },
          409,
        );
      const result = await subscribe(env, "cards.remove", { token: c.token });
      if (result.success !== true)
        throw Error("Provayder kartani o‘chirishni tasdiqlamadi");
      await db.collection("saved_cards").deleteOne({ id: String(b.id), owner: u.userId });
      return reply({ ok: true });
    }
    if (
      b.action !== "add" ||
      typeof b.token !== "string" ||
      b.token.length < 20 ||
      b.token.length > 4096
    )
      return reply({ error: "Karta tokeni noto‘g‘ri" }, 400);
    const { card } = await subscribe(env, "cards.check", { token: b.token });
    if (
      card?.verify !== true ||
      card.recurrent !== true ||
      typeof card.number !== "string" ||
      !card.number.includes("*") ||
      card.number.length > 24 ||
      typeof card.expire !== "string"
    )
      return reply({ error: "Karta bank SMS kodi bilan tasdiqlanmagan" }, 400);
    const exists = await db.collection("saved_cards").findOne(
      { token: b.token },
      { projection: { owner: 1 } },
    );
    if (exists)
      return exists.owner === u.userId
        ? reply({ ok: true })
        : reply({ error: "Karta tokeni boshqa hisobga tegishli" }, 409);
    if (await db.collection("saved_cards").countDocuments({ owner: u.userId }) >= 5)
      return reply({ error: "5 tagacha karta qo‘shish mumkin" }, 400);
    await db.collection("saved_cards").insertOne({
      id: crypto.randomUUID(), owner: u.userId, token: b.token,
      number: card.number, expiry: card.expire, created: Date.now(),
    });
    return reply({ ok: true });
  } catch {
    return reply(
      {
        error: "Payme kartani tasdiqlamadi yoki xizmatga ulanishda xatolik bor",
      },
      502,
    );
  }
}

async function demoCard(req, u, db) {
  try {
    const b = await req.json();
    if (
      Object.keys(b).some(
        (k) => !["action", "id", "brand", "last4", "expiry"].includes(k),
      )
    )
      return reply(
        { error: "Faqat karta turi va oxirgi 4 raqam yuborilishi mumkin" },
        400,
      );
    if (b.action === "remove") {
      await db.collection("demo_wallet").deleteOne({ id: String(b.id || ""), owner: u.userId });
      return reply({ ok: true });
    }
    if (
      b.action !== "add" ||
      !["uzcard", "humo", "visa"].includes(b.brand) ||
      !/^\d{4}$/.test(b.last4) ||
      !validExpiry(b.expiry)
    )
      return reply({ error: "Karta ma’lumotlari noto‘g‘ri" }, 400);
    if (
      await db.collection("demo_wallet").countDocuments({ owner: u.userId }) >= 5
    )
      return reply({ error: "5 tagacha sinov kartasi mumkin" }, 400);
    await db.collection("demo_wallet").insertOne({
      id: crypto.randomUUID(), owner: u.userId, brand: b.brand,
      last4: b.last4, expiry: b.expiry, created: Date.now(),
    });
    return reply({ ok: true, demo: true });
  } catch {
    return reply({ error: "Sinov kartasi saqlanmadi" }, 400);
  }
}
