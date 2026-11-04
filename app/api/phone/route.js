import { getMongoDb } from "../../../lib/mongodb.js";
import { env } from "../../../lib/runtime-env.js";
import { getAppUser, sameOrigin, throttle } from "../../../lib/auth.js";
import { digest, hex, phoneNumber } from "../../../lib/password.js";
import { sendOtp, consumeOtp, smsConfigured } from "../../../lib/otp.js";
import { mockSms } from "../../../lib/modes.js";
const reply = (v, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
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
  if (!u) return reply({ error: "Hisobga kiring" }, 401);
  const db = await getMongoDb();
  const a = await db
    .collection("app_accounts")
    .findOne({ owner: u.userId }, { projection: { phone: 1, phone_verified: 1 } });
  return reply({
    phone: a?.phone,
    verified: !!a?.phone_verified,
    configured: smsConfigured(env),
    mock: mockSms(env),
  });
}
export async function POST(req) {
  try {
    if (env.SMS_MODE === "off") return reply({error:"SMS o‘chirilgan. Telefon va parol bilan kiring."},410);
    if (
      !sameOrigin(req) &&
      !(req.headers.get("X-Client") === "app" && !req.headers.get("origin"))
    )
      return reply({ error: "Ruxsat yo‘q" }, 403);
    const b = await req.json(),
      u = await getAppUser(),
      db = await getMongoDb();
    if (!["send", "verify"].includes(b.action))
      return reply({ error: "Noma’lum amal" }, 400);
    const purpose = b.purpose || "verify";
    if (!["verify", "register", "login", "reset"].includes(purpose))
      return reply({ error: "Maqsad noto‘g‘ri" }, 400);
    const a =
      purpose === "verify" && u
        ? await db
            .collection("app_accounts")
            .findOne({ owner: u.userId }, { projection: { phone: 1 } })
        : null;
    const phone = phoneNumber(purpose === "verify" ? a?.phone : b.phone);
    if (!phone)
      return reply(
        { error: "Telefon raqamini kiriting / Укажите телефон" },
        400,
      );
    if (
      !(await throttle(
        db,
        "otp-ip:" + (req.headers.get("cf-connecting-ip") || "local"),
        40,
      )) ||
      !(await throttle(db, "otp:" + phone + ":" + b.action, 15))
    )
      return reply({ error: "Urinishlar ko‘paydi" }, 429);
    if (b.action === "send") return reply(await sendOtp(env, phone, purpose));
    if(purpose === "reset") {
      await consumeOtp(env,phone,'reset',String(b.code||''));
      const resetToken=hex(crypto.getRandomValues(new Uint8Array(32)));
      const expires = Date.now() + 300000;
      await withMongoTransaction(db, async (session) => {
        await db.collection("password_resets").deleteMany(
          { $or: [{ phone }, { expires: { $lt: Date.now() } }] },
          { session },
        );
        await db.collection("password_resets").insertOne(
          { token: await digest(resetToken), phone, expires },
          { session },
        );
      });
      return reply({ok:true,resetToken});
    }
    if (purpose !== "verify" || !u)
      return reply(
        { error: "Kodni kirish yoki ro‘yxatdan o‘tish oynasida tasdiqlang" },
        400,
      );
    await consumeOtp(env, phone, purpose, String(b.code));
    await db.collection("app_accounts").updateOne(
      { owner: u.userId, phone },
      { $set: { phone_verified: 1 } },
    );
    return reply({ ok: true, verified: true });
  } catch (e) {
    return reply({ error: e.message }, e.status || 400);
  }
}
