// Explicit modes win. Legacy DEMO_MODE only enables mock; it never enables live.
export function mode(env, name) {
  const value = env[name] ?? "mock";
  if (!["mock", "live"].includes(value))
    throw Error(`${name}: mock yoki live bo‘lishi kerak`);
  return value;
}
export const mockPayments = (env) => mode(env, "PAYMENTS_MODE") === "mock";
export const mockSms = (env) => env.SMS_MODE !== "off" && mode(env, "SMS_MODE") === "mock";
