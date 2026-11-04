import { mockPayments } from "./modes.js";
export const cardsConfigured = (e) =>
  !!(e.PAYME_SUBSCRIBE_ID && e.PAYME_SUBSCRIBE_KEY);
export async function subscribe(e, method, params, fetcher = fetch) {
  if (mockPayments(e)) throw Error("Mock rejimida tashqi to‘lov o‘chirilgan");
  if (!cardsConfigured(e)) throw Error("Payme karta xizmati ulanmagan");
  const r = await fetcher("https://checkout.paycom.uz/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth": e.PAYME_SUBSCRIBE_ID + ":" + e.PAYME_SUBSCRIBE_KEY,
    },
    body: JSON.stringify({ id: Date.now(), method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json();
  if (!r.ok || d.error || !d.result)
    throw Error("Payme so‘rovni tasdiqlamadi. Karta va SMS kodini tekshiring.");
  return d.result;
}
