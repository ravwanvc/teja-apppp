import { resetWithRecovery } from "../../../lib/recovery.js";
import { consumeOtp } from "../../../lib/otp.js";
import { mockSms } from "../../../lib/modes.js";
import { adminSecondFactor } from "../../../lib/totp.js";
import {
  issueMobileSession,
  rotateMobileSession,
} from "../../../lib/mobile-session.js";
import { getMongoDb } from "../../../lib/mongodb.js";
import { env } from "../../../lib/runtime-env.js";
import { headers } from "next/headers";
import {
  bearerToken,
  getAppUser,
  sameOrigin,
  throttle,
} from "../../../lib/auth.js";
import {
  digest,
  hex,
  passwordHash,
  passwordMatches,
  phoneNumber,
} from "../../../lib/password.js";
import {
  mongoUnavailable,
  MONGO_HINT,
  logError,
} from "../../../lib/mongo-errors.js";

const reply = (v, status = 200, extra = {}) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
const cookie = (value, age, secure = true) =>
  `teja_session=${value}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${age}`;

async function withMongoTransaction(db, callback) {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => callback(session));
  } finally {
    await session.endSession();
  }
}

export async function GET() {
  try {
    const u = await getAppUser();
    return reply({
      user: u,
      smsConfigured:
        mockSms(env) ||
        !!(
          env.TWILIO_ACCOUNT_SID &&
          env.TWILIO_AUTH_TOKEN &&
          env.TWILIO_VERIFY_SERVICE_SID
        ),
      mockSms: mockSms(env),
      smsRequired: env.SMS_REQUIRED === "true",
    });
  } catch (e) {
    logError("GET /api/auth", e);
    return mongoUnavailable(e)
      ? reply({ error: MONGO_HINT }, 503)
      : reply({ error: "Holatni tekshirib bo‘lmadi" }, 500);
  }
}

export async function POST(req) {
  try {
    const mobile =
      req.headers.get("x-client") === "app" && !req.headers.get("origin");
    if (!sameOrigin(req) && !mobile)
      return reply({ error: "Ruxsat etilmagan so‘rov" }, 403);
    if (Number(req.headers.get("content-length")) > 4096)
      return reply({ error: "So‘rov juda katta" }, 413);
    const b = await req.json();
    const db = await getMongoDb();
    if (b.action === "refresh" && mobile) {
      try {
        return reply(await rotateMobileSession(db, b.refreshToken));
      } catch {
        return reply({ error: "Sessiya tugagan" }, 401);
      }
    }
    if (b.action === "logout") {
      const h = await headers();
      if (mobile) {
        const raw = bearerToken(h.get("authorization"));
        if (raw)
          await db.collection("mobile_sessions").deleteOne({
            access_hash: await digest(raw),
          });
        return reply({ ok: true });
      }
      const token = h
        .get("cookie")
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("teja_session="))
        ?.slice(13);
      if (token)
        await db.collection("app_sessions").deleteOne({
          token: await digest(token),
        });
      return reply({ ok: true }, 200, {
        "Set-Cookie": cookie("", 0, new URL(req.url).protocol === "https:"),
      });
    }
    if (env.SMS_MODE === "off" && b.action === "otpLogin")
      return reply({ error: "Telefon va parol bilan kiring" }, 410);
    const phone =
        typeof b.phone === "string" && /^\+998[0-9]{9}$/.test(b.phone)
          ? b.phone
          : null,
      password = b.password;
    if (
      !phone ||
      (b.action !== "otpLogin" &&
        (typeof password !== "string" ||
          password.length < 8 ||
          password.length > 128))
    )
      return reply(
        {
          error:
            "Telefon +998 va aynan 9 raqamdan, parol esa 8–128 belgidan iborat bo‘lsin",
        },
        400,
      );
    const ip =
      req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-nf-client-connection-ip") ||
      req.headers.get("cf-connecting-ip") ||
      "local";
    if (
      !(await throttle(db, "ip:" + ip, 50)) ||
      !(await throttle(db, "phone-ip:" + phone + ":" + ip, 10))
    )
      return reply(
        {
          error: "Urinishlar ko‘paydi. 15 daqiqadan so‘ng qayta urinib ko‘ring",
        },
        429,
      );

    let id;
    let role = "member";
    let adminVersion = null;
    if (
      b.action === "admin" ||
      (b.action === "login" && phone === phoneNumber(env.ADMIN_PHONE))
    ) {
      if (!phoneNumber(env.ADMIN_PHONE) || !env.ADMIN_PASSWORD_HASH)
        return reply(
          {
            error:
              "Admin kirishi sozlanmagan: ADMIN_PHONE va ADMIN_PASSWORD_HASH kerak",
          },
          503,
        );
      const valid = await passwordMatches(password, env.ADMIN_PASSWORD_HASH);
      if (phone !== phoneNumber(env.ADMIN_PHONE) || !valid)
        return reply({ error: "Telefon yoki parol noto‘g‘ri" }, 401);
      if (mobile)
        return reply({ error: "Admin uchun veb kirishdan foydalaning" }, 403);
      if (!adminSecondFactor(env, String(b.code || "")))
        return reply({ error: "2FA kodi kerak / Требуется код 2FA" }, 401);
      id =
        (await db
          .collection("app_admin")
          .findOne({}, { projection: { id: 1 } }))?.id ||
        "admin-" + crypto.randomUUID();
      await withMongoTransaction(db, async (session) => {
        await db.collection("users").updateOne(
          { id },
          {
            $setOnInsert: {
              id,
              name: "Administrator",
              created: Date.now(),
            },
            $set: { role: "admin" },
          },
          { upsert: true, session },
        );
        await db.collection("app_admin").updateOne(
          { id },
          { $setOnInsert: { id } },
          { upsert: true, session },
        );
      });
      role = "admin";
      adminVersion = await digest(phone + env.ADMIN_PASSWORD_HASH);
    } else if (b.action === "register") {
      if (phone === phoneNumber(env.ADMIN_PHONE))
        return reply(
          { error: "Bu raqam bilan ro‘yxatdan o‘tib bo‘lmaydi" },
          400,
        );
      if (!["member", "seller"].includes(b.role))
        return reply({ error: "Hisob turini tanlang" }, 400);
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (name.length < 2 || name.length > 80)
        return reply({ error: "Ism 2–80 belgidan iborat bo‘lsin" }, 400);
      if (await db.collection("app_accounts").findOne({ phone }))
        return reply(
          {
            error:
              "Ro‘yxatdan o‘tib bo‘lmadi. Mavjud hisobga kirishni tekshiring",
          },
          409,
        );
      const verified = env.SMS_REQUIRED === "true";
      if (verified)
        await consumeOtp(env, phone, "register", String(b.code || ""));
      id = crypto.randomUUID();
      role = b.role;
      const hash = await passwordHash(password);
      await withMongoTransaction(db, async (session) => {
        await db.collection("users").insertOne(
          { id, name, role, created: Date.now() },
          { session },
        );
        await db.collection("app_accounts").insertOne(
          {
            phone,
            owner: id,
            password_hash: hash,
            phone_verified: verified ? 1 : 0,
          },
          { session },
        );
      });
    } else if (["login", "otpLogin", "reset"].includes(b.action)) {
      const account = await db.collection("app_accounts").findOne({ phone });
      const user = account
        ? await db.collection("users").findOne({ id: account.owner })
        : null;
      const row = account && user ? { ...account, role: user.role } : null;
      const valid =
        b.action !== "login" ||
        (await passwordMatches(
          password,
          row?.password_hash ||
            (await passwordHash(
              "constant-unused-password",
              "00000000000000000000000000000000",
            )),
        ));
      if (!row || !valid || row.role === "admin")
        return reply({ error: "Telefon yoki parol noto‘g‘ri" }, 401);
      if (b.action === "reset") {
        if (b.password !== b.confirmPassword)
          return reply({ error: "Parollar mos emas" }, 400);
        if (env.SMS_MODE === "off") {
          await resetWithRecovery(db, row.owner, b.recoveryCode, password);
        } else {
          const token =
            typeof b.resetToken === "string" ? await digest(b.resetToken) : "";
          const claim = await db.collection("password_resets").findOneAndDelete({
            token,
            phone,
            expires: { $gt: Date.now() },
          });
          if (!claim)
            return reply(
              {
                error:
                  "Tasdiqlash muddati tugagan. SMSni qayta tekshiring.",
              },
              400,
            );
        }
      } else if (b.action === "otpLogin") {
        await consumeOtp(env, phone, "login", String(b.code || ""));
      }
      id = row.owner;
      role = row.role;
      if (b.action === "reset") {
        await withMongoTransaction(db, async (session) => {
          await db.collection("app_accounts").updateOne(
            { owner: id },
            { $set: { password_hash: await passwordHash(password) } },
            { session },
          );
          await db.collection("app_sessions").deleteMany(
            { owner: id },
            { session },
          );
          await db.collection("mobile_sessions").deleteMany(
            { owner: id },
            { session },
          );
        });
      }
    } else {
      return reply({ error: "Noma’lum amal" }, 400);
    }

    if (mobile)
      return reply({
        ok: true,
        role,
        ...(await issueMobileSession(db, id)),
      });
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const now = Date.now();
    await withMongoTransaction(db, async (session) => {
      await db.collection("app_sessions").insertOne(
        {
          token: await digest(token),
          owner: id,
          expires: now + 7 * 86400000,
          admin_version: adminVersion,
        },
        { session },
      );
      await db.collection("app_sessions").deleteMany(
        { expires: { $lt: now } },
        { session },
      );
    });
    return reply(
      {
        ok: true,
        role,
        redirect:
          role === "admin"
            ? "/admin"
            : role === "seller"
              ? "/?view=seller"
              : "/",
      },
      200,
      {
        "Set-Cookie": cookie(
          token,
          7 * 86400,
          new URL(req.url).protocol === "https:",
        ),
      },
    );
  } catch (e) {
    logError("POST /api/auth", e);
    if (mongoUnavailable(e)) return reply({ error: MONGO_HINT }, 503);
    if (e?.code === 11000)
      return reply(
        {
          error:
            "Ro‘yxatdan o‘tib bo‘lmadi. Mavjud hisobga kirishni tekshiring",
        },
        409,
      );
    return reply(
      {
        error: e.status
          ? e.message
          : "Kirish amalga oshmadi. Telefon, parol yoki tiklash kalitini tekshiring",
      },
      e.status || 400,
    );
  }
}
