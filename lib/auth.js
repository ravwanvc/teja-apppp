import { headers } from "next/headers";
import { digest, phoneNumber } from "./password.js";
import { getMongoDb } from "./mongodb.js";

const bearerToken = (value) => value?.replace(/^Bearer\s+/i, "");

export async function getAppUser() {
  const h = await headers();
  const db = await getMongoDb();
  const now = Date.now();
  if (h.get("x-client") === "app") {
    const raw = bearerToken(h.get("authorization"));
    if (!/^[a-f0-9]{64}$/.test(raw || "")) return null;
    const session = await db.collection("mobile_sessions").findOne({
      access_hash: await digest(raw),
      access_expires: { $gt: now },
      refresh_expires: { $gt: now },
    });
    if (!session) return null;
    const user = await db.collection("users").findOne({ id: session.owner });
    return user && user.role !== "admin"
      ? { userId: user.id, displayName: user.name, role: user.role }
      : null;
  }
  const raw = h
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("teja_session="))
    ?.slice(13);
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) return null;
  const session = await db.collection("app_sessions").findOne({
    token: await digest(raw),
    expires: { $gt: now },
  });
  if (!session) return null;
  const user = await db.collection("users").findOne({ id: session.owner });
  if (!user) return null;
  if (
    user.role === "admin" &&
    (!process.env.ADMIN_PASSWORD_HASH ||
      session.admin_version !==
        (await digest(
          (phoneNumber(process.env.ADMIN_PHONE) || "") +
            process.env.ADMIN_PASSWORD_HASH,
        )))
  )
    return null;
  return { userId: user.id, displayName: user.name, role: user.role };
}

export async function currentUser() {
  const u = await getAppUser();
  if (!u) return null;
  const db = await getMongoDb();
  return db.collection("users").findOne(
    { id: u.userId },
    { projection: { _id: 0 } },
  );
}

export function sameOrigin(req) {
  const authorization = req.headers.get("authorization") || "";
  return (
    req.headers.get("origin") === new URL(req.url).origin ||
    (!req.headers.get("origin") &&
      req.headers.get("x-client") === "app" &&
      /^[a-f0-9]{64}$/i.test(bearerToken(authorization) || ""))
  );
}

export async function throttle(db, key, limit, windowMs = 900000) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const id = await digest(key + ":" + bucket);
  let row;
  try {
    row = await db.collection("auth_limits").findOneAndUpdate(
      { key: id },
      { $inc: { n: 1 }, $set: { expires: now + windowMs } },
      { upsert: true, returnDocument: "after" },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    row = await db.collection("auth_limits").findOneAndUpdate(
      { key: id },
      { $inc: { n: 1 }, $set: { expires: now + windowMs } },
      { returnDocument: "after" },
    );
  }
  await db.collection("auth_limits").deleteMany({ expires: { $lt: now } });
  return row.n <= limit;
}

export async function phoneVerified(db, owner) {
  return !!(await db.collection("app_accounts").findOne(
    { owner },
    { projection: { phone_verified: 1 } },
  ))?.phone_verified;
}

export { bearerToken };
