export const mongoUnavailable = (error) =>
  error?.code === "MONGODB_NOT_CONFIGURED" ||
  error?.name === "MongoServerSelectionError";

export const MONGO_HINT =
  "MongoDB ulanmagan. MONGODB_URI ni sozlang va Atlas ulanish sozlamalarini tekshiring.";

export const logError = (where, error) => {
  const reason = error?.code || error?.name || "MongoDB error";
  console.error(`[teja] ${where}: ${reason}`);
};
