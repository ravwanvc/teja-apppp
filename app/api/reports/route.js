import { getMongoDb } from '../../../lib/mongodb.js';
import { getAppUser, sameOrigin, throttle } from '../../../lib/auth.js';
export async function GET(){
 const u=await getAppUser();if(u?.role!=='admin')return Response.json({error:'Faqat admin'},{status:403});
 return Response.json({reports:await (await getMongoDb()).collection('reports').find({},{projection:{_id:0}}).sort({created:-1}).limit(200).toArray()});
}
export async function POST(req){
 if(!sameOrigin(req))return Response.json({error:'Origin'},{status:403});
 const u=await getAppUser();if(!u)return Response.json({error:'Kirish kerak'},{status:401});
 try{
  const db=await getMongoDb(),b=await req.json();
  if(b.action==='resolve'){
   if(u.role!=='admin')return Response.json({error:'Faqat admin'},{status:403});
   const result=await db.collection('reports').updateOne({id:String(b.id)},{$set:{status:'resolved'}});
   if(result.modifiedCount)await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true});
   return Response.json({ok:true});
  }
  if(!(await throttle(db,'report:'+u.userId,10)))return Response.json({error:'Bir oz kuting'},{status:429});
  const target=String(b.target),collection={product:'products',seller:'users',review:'reviews'}[b.kind];
  if(!collection||typeof b.reason!=='string'||b.reason.trim().length<5||b.reason.length>1000)throw Error('Sababni yozing (5–1000 belgi)');
  if(!await db.collection(collection).findOne(b.kind==='review'?{order_id:target}:{id:target},{projection:{_id:1}}))throw Error('Topilmadi');
  await db.collection('reports').insertOne({id:crypto.randomUUID(),reporter:u.userId,kind:b.kind,target,reason:b.reason.trim(),status:'pending',created:Date.now()});
  await db.collection('change_version').updateOne({id:1},{$inc:{version:1}},{upsert:true});
  return Response.json({ok:true});
 }catch(e){return Response.json({error:e.message},{status:400});}
}
