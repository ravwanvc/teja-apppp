import { digest, equal, hex } from "./password.js";
import { mockSms } from "./modes.js";
import { getMongoDb } from "./mongodb.js";

export const smsConfigured = (e) =>
  e.SMS_MODE !== "off" &&
  (mockSms(e) ||
    !!(
      e.TWILIO_ACCOUNT_SID &&
      e.TWILIO_AUTH_TOKEN &&
      e.TWILIO_VERIFY_SERVICE_SID
    ));
const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
async function twilio(e, phone, code) {
  if (!smsConfigured(e))
    throw failure("SMS sozlanmagan: Twilio kalitlarini kiriting", 503);
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(e.TWILIO_VERIFY_SERVICE_SID)}/${code ? "VerificationCheck" : "Verifications"}`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + btoa(e.TWILIO_ACCOUNT_SID + ":" + e.TWILIO_AUTH_TOKEN),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        ...(code ? { Code: code } : { Channel: "sms" }),
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const data = await response.json();
  if (!response.ok) throw failure("SMS xizmati so‘rovni qabul qilmadi", 502);
  return data;
}
export async function sendOtp(e, phone, purpose, now = Date.now()) {
  if (!smsConfigured(e))
    throw failure("SMS sozlanmagan: Twilio kalitlarini kiriting", 503);
  const db = await getMongoDb();
  const owner = purpose + ":" + phone;
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const code = String(
    crypto.getRandomValues(new Uint32Array(1))[0] % 1000000,
  ).padStart(6, "0");
  const hash = salt + ":" + (await digest(salt + ":" + code));
  try {
    await db.collection("phone_otps").findOneAndUpdate(
      { owner, sent_at: { $lte: now - 60000 } },
      {
        $set: { hash, expires: now + 300000, attempts: 0, sent_at: now },
        $setOnInsert: { owner },
      },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (error?.code === 11000)
      throw failure("60 soniyadan so‘ng qayta yuboring", 429);
    throw error;
  }
  if (!mockSms(e)) {
    const d = await twilio(e, phone);
    if (d.status !== "pending")
      throw failure("SMS yuborilishi tasdiqlanmadi", 502);
  }
  return {
    ok: true,
    expiresAt: now + 300000,
    retryAfter: 60,
    mock: mockSms(e),
    ...(mockSms(e)
      ? { mockCode: code, label: "SINOV SMS / ТЕСТОВОЕ SMS" }
      : {}),
  };
}
export async function consumeOtp(e, phone, purpose, code, now = Date.now()) {
  const db = await getMongoDb();
  const owner = purpose + ":" + phone;
  const row = await db.collection("phone_otps").findOneAndUpdate(
    { owner, expires: { $gt: now }, attempts: { $lt: 5 } },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!row)
    throw failure(
      "Kod muddati tugagan yoki 5 urinish sarflangan. Yangi kod oling",
    );
  if (!/^\d{6}$/.test(String(code))) throw failure("6 xonali kodni kiriting");
  let valid = false;
  if (mockSms(e))
    valid =
      code === "123456" ||
      equal(
        row.hash.split(":")[1],
        await digest(row.hash.split(":")[0] + ":" + code),
      );
  else {
    const d = await twilio(e, phone, code);
    valid = d.status === "approved" && d.to === phone;
  }
  if (!valid) throw failure("Kod noto‘g‘ri");
  const result = await db.collection("phone_otps").deleteOne({
    owner,
    hash: row.hash,
    expires: { $gt: now },
  });
  if (!result.deletedCount) throw failure("Kod allaqachon ishlatilgan");
  return true;
}
