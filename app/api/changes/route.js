import { getMongoDb } from '../../../lib/mongodb.js';
import { expireOrders } from '../../../lib/commerce.js';
import { pickupReminders } from '../../../lib/notifications.js';
export async function GET(req){
 const db=await getMongoDb();
 await expireOrders(db);
 await pickupReminders(db);
 const {version=0}=await db.collection('change_version').findOne({id:1})||{};
 const since=Number(new URL(req.url).searchParams.get('since'));
 return Response.json({changed:since!==version,version},{headers:{'Cache-Control':'no-store'}});
}
