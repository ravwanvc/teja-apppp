import { digest, hex } from "./password.js";
const token = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function issueMobileSession(db, owner) {
  const accessToken = token();
  const refreshToken = token();
  const now = Date.now();
  await db.collection("mobile_sessions").insertOne({
    access_hash: await digest(accessToken),
    refresh_hash: await digest(refreshToken),
    owner,
    access_expires: now + 900000,
    refresh_expires: now + 30 * 86400000,
    family: crypto.randomUUID(),
  });
  return { accessToken, refreshToken, expiresIn: 900 };
}
export async function rotateMobileSession(db, raw) {
  if (!/^[a-f0-9]{64}$/.test(raw || ""))
    throw Error("Refresh token noto‘g‘ri");
  const accessToken = token();
  const refreshToken = token();
  const now = Date.now();
  const row = await db.collection("mobile_sessions").findOneAndUpdate(
    { refresh_hash: await digest(raw), refresh_expires: { $gt: now } },
    {
      $set: {
        access_hash: await digest(accessToken),
        refresh_hash: await digest(refreshToken),
        access_expires: now + 900000,
      },
    },
    { returnDocument: "after", projection: { owner: 1 } },
  );
  if (!row) throw Error("Sessiya tugagan. Qayta kiring");
  return { accessToken, refreshToken, expiresIn: 900 };
}
