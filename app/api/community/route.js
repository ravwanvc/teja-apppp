import { getMongoDb,getMongoClient } from '../../../lib/mongodb.js';
import {getAppUser,sameOrigin} from '../../../lib/auth.js';

export async function GET(){
 const db=await getMongoDb(),u=await getAppUser();
 if(!u)return Response.json({follows:[],waiting:[],claims:[]});
 const [follows,waiting,claims]=await Promise.all([
  db.collection('shop_follows').find({owner:u.userId},{projection:{_id:0}}).toArray(),
  db.collection('waitlist').find({owner:u.userId},{projection:{_id:0}}).toArray(),
  db.collection('quality_claims').find(u.role==='admin'?{}:{owner:u.userId},{projection:{_id:0}}).sort({created:-1}).limit(u.role==='admin'?200:0).toArray()
 ]);
 return Response.json({follows,waiting,claims},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req){try{
 if(!sameOrigin(req))return Response.json({error:'Origin'},{status:403});
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 const db=await getMongoDb(),b=await req.json(),now=Date.now();
 if(b.action==='follow'){
  const seller=await db.collection('users').findOne({id:String(b.seller),role:'seller'},{projection:{id:1}});
  if(!seller)throw Error('Do‘kon topilmadi');
  if(b.enabled===false)await db.collection('shop_follows').deleteOne({owner:u.userId,seller:seller.id});
  else {const hour=Number(b.hour??18);if(!Number.isInteger(hour)||hour<0||hour>23)throw Error('Soat noto‘g‘ri');await db.collection('shop_follows').updateOne({owner:u.userId,seller:seller.id},{$set:{hour}}, {upsert:true});}
 }else if(b.action==='wait'){
  const item=await db.collection('products').findOne({id:String(b.id),active:true},{projection:{id:1}});
  if(!item)throw Error('Taklif topilmadi');
  await db.collection('waitlist').updateOne({owner:u.userId,product:item.id},{$setOnInsert:{owner:u.userId,product:item.id,created:now}},{upsert:true});
 }else if(b.action==='claim'){
  const order=await db.collection('orders').findOne({id:String(b.id),buyer:u.userId,status:{$in:['reserved','collected']}},{projection:{id:1}});
  if(!order)throw Error('Buyurtma topilmadi');
  const reason=String(b.reason||'').trim();if(reason.length<10||reason.length>2000)throw Error('Muammoni 10–2000 belgi bilan yozing');
  await db.collection('quality_claims').updateOne({order_id:order.id},{$setOnInsert:{id:crypto.randomUUID(),order_id:order.id,owner:u.userId,reason,status:'pending',reply:'',created:now,updated:now}},{upsert:true});
 }else if(b.action==='resolve'&&u.role==='admin'){
  if(!['approved','rejected'].includes(b.status)||String(b.reply||'').trim().length<5)throw Error('Qaror izohini kiriting');
  const claim=await db.collection('quality_claims').findOne({id:String(b.id),status:'pending'});
  if(!claim)throw Error('Murojaat allaqachon ko‘rilgan');
  const client=await getMongoClient(),session=client.startSession();
  try{await session.withTransaction(async()=>{
   const changed=await db.collection('quality_claims').updateOne({id:claim.id,status:'pending'},{$set:{status:b.status,reply:String(b.reply).slice(0,1000),updated:now}},{session});
   if(!changed.modifiedCount)throw Error('Murojaat allaqachon ko‘rilgan');
   const orders=db.collection('orders'),old=await orders.findOne({id:claim.order_id},{session});
   if(old){const next={status:['reserved','pending_payment'].includes(old.status)&&b.status==='approved'?'cancelled':old.status,payment_state:b.status==='approved'&&old.payment_state==='cash_paid'?'cash_refund_due':b.status==='approved'&&['paid','test'].includes(old.payment_state)?'refund_due':old.payment_state};
    await orders.updateOne({id:old.id},{$set:next},{session});
    if(next.status!==old.status&&['cancelled','expired','payment_expired'].includes(next.status)){
     const items=Array.isArray(old.cart_items)?old.cart_items:JSON.parse(old.cart_items||'[]');
     for(const item of items.length?items:[{id:old.product,qty:old.qty}])await db.collection('products').updateOne({id:item.id},{$inc:{stock:item.qty}},{session});
    }
    if(next.status!==old.status){
     const product=await db.collection('products').findOne({id:old.product},{projection:{owner:1},session});
     for(const owner of [old.buyer,product?.owner].filter(Boolean))await db.collection('notifications').updateOne({owner,kind:next.status,entity:old.id},{$setOnInsert:{id:crypto.randomUUID(),owner,kind:next.status,entity:old.id,created:now,read_at:null}},{upsert:true,session});
    }
    if(next.payment_state!==old.payment_state&&next.payment_state==='refunded')await db.collection('notifications').updateOne({owner:old.buyer,kind:'refunded',entity:old.id},{$setOnInsert:{id:crypto.randomUUID(),owner:old.buyer,kind:'refunded',entity:old.id,created:now,read_at:null}},{upsert:true,session});
   }
   await db.collection('notifications').updateOne({owner:claim.owner,kind:'claim_updated',entity:claim.order_id},{$setOnInsert:{id:crypto.randomUUID(),owner:claim.owner,kind:'claim_updated',entity:claim.order_id,created:now,read_at:null}},{upsert:true,session});
   await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
  });}finally{await session.endSession();}
 }else throw Error('Noma’lum amal');
 return Response.json({ok:true});
 }catch(e){return Response.json({error:e.message},{status:400});}}
