import { mockPayments } from "../../../lib/modes.js";
import { env } from "../../../lib/runtime-env.js";
import { paymentConfig } from "../../../lib/payments.js";
export async function GET() {
  return Response.json(
    mockPayments(env)
      ? { demo: true, click: true, payme: true, card: true }
      : paymentConfig(env),
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST() {
  return Response.json(
    { error: "Buyurtma oynasidan foydalaning" },
    { status: 400 },
  );
}
