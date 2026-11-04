import { digest, passwordHash } from "./password.js";

export const recoveryHash = (code) =>
  digest(String(code || "").trim().toUpperCase());

export async function resetWithRecovery(db, owner, code, password) {
  if (!/^TEJA-[a-f0-9]{48}$/i.test(String(code || "").trim()))
    throw Error("Tiklash kaliti noto‘g‘ri");
  const hash = await recoveryHash(code);
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await db.collection("recovery_codes").findOneAndDelete(
        { owner, code_hash: hash },
        { session },
      );
      if (!claimed) throw Error("Tiklash kaliti noto‘g‘ri yoki avval ishlatilgan");
      const result = await db.collection("app_accounts").updateOne(
        { owner },
        { $set: { password_hash: await passwordHash(password) } },
        { session },
      );
      if (!result.matchedCount) throw Error("Tiklash kaliti noto‘g‘ri yoki avval ishlatilgan");
      await db.collection("app_sessions").deleteMany({ owner }, { session });
      await db.collection("mobile_sessions").deleteMany({ owner }, { session });
    });
  } finally {
    await session.endSession();
  }
}
