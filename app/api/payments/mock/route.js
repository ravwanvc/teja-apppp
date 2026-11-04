import { env } from "../../../../lib/runtime-env.js";
import { getMongoDb } from "../../../../lib/mongodb.js";
import { getAppUser, sameOrigin, throttle } from "../../../../lib/auth.js";
import { simulatePayment } from "../../../../lib/mock-payment.js";
import { expireOrders } from "../../../../lib/commerce.js";
export async function GET(req) {
  const u = await getAppUser();
  if (!u) return Response.json({error:'Avval hisobingizga kiring'},{status:401});
  const db=await getMongoDb();
  await expireOrders(db);
  const row = await db.collection('orders').findOne({id:new URL(req.url).searchParams.get('id') || '',buyer:u.userId,is_mock:1});
  if (!row) return Response.json({error:'Buyurtma topilmadi'},{status:404});
  const snapshot = typeof row.snapshot==='string'?JSON.parse(row.snapshot||'{}'):(row.snapshot||{});
  return Response.json({order:{id:row.id,title:snapshot.title || 'Buyurtma',shop:snapshot.shop || '',total:row.price*row.qty,deposit:row.deposit,method:row.mock_method || row.provider,status:row.status,payment_state:row.payment_state,hold_until:row.hold_until}},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req) {
  if (!sameOrigin(req))
    return Response.json({ error: "Origin" }, { status: 403 });
  const u = await getAppUser();
  if (!u) return Response.json({ error: "Kirish kerak" }, { status: 401 });
  const db=await getMongoDb();
  if (!(await throttle(db, "mock-pay:" + u.userId, 30, 60000)))
    return Response.json({ error: "Bir oz kuting" }, { status: 429 });
  try {
    const b = await req.json();
    if (!["pay", "reject", "expire"].includes(b.outcome))
      throw Error("Amal noto‘g‘ri");
    return Response.json(await simulatePayment(env, u.userId, b.id, b.outcome));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
