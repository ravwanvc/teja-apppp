import { getMongoDb } from '../../../lib/mongodb.js';
import { getAppUser, sameOrigin } from '../../../lib/auth.js';
import { pickupReminders } from '../../../lib/notifications.js';
export async function GET(){
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 const db=await getMongoDb();await pickupReminders(db);
 const now=Date.now(),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tashkent',hour:'2-digit',hourCycle:'h23'}).format(now));
 const follows=await db.collection('shop_follows').find({owner:u.userId,hour:{$lte:hour}}).toArray();
 for(const f of follows){
  const products=await db.collection('products').find({owner:f.seller,active:true,stock:{$gt:0},until:{$gt:now},created:{$gt:now-86400000}}).project({id:1}).toArray();
  for(const p of products){
   const result=await db.collection('notifications').updateOne({owner:u.userId,kind:'new_offer',entity:p.id},{$setOnInsert:{id:crypto.randomUUID(),owner:u.userId,kind:'new_offer',entity:p.id,created:now,read_at:null}},{upsert:true});
   if(result.upsertedCount)await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1,version:0},$inc:{version:1}},{upsert:true});
  }
 }
 return Response.json({notifications:await db.collection('notifications').find({owner:u.userId},{projection:{_id:0}}).sort({created:-1}).limit(100).toArray(),channel:'in-app'},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req){
 if(!sameOrigin(req))return Response.json({error:'Origin'},{status:403});
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 const b=await req.json(),filter={owner:u.userId};if(b.all!==true)filter.id=String(b.id||'');
 const db=await getMongoDb(),updated=await db.collection('notifications').updateMany(filter,{$set:{read_at:Date.now()}});
 if(updated.modifiedCount)await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1,version:0},$inc:{version:1}},{upsert:true});
 return Response.json({ok:true});
}
