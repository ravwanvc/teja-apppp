import { getMongoDb,getMongoClient } from '../../../lib/mongodb.js';
import { env } from '../../../lib/runtime-env.js';
import {getAppUser,sameOrigin} from '../../../lib/auth.js';
import {refundMock} from '../../../lib/mock-payment.js';
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 const u=await getAppUser();if(u?.role!=='admin')return json({error:'Faqat admin'},403);
 const db=await getMongoDb(),orders=await db.collection('orders').find({payment_state:{$in:['refund_due','cash_refund_due','refunded']}},{projection:{_id:0}}).sort({created:-1}).limit(200).toArray();
 const records=await db.collection('refund_records').find({order_id:{$in:orders.map(o=>o.id)}}).toArray(),byOrder=new Map(records.map(r=>[r.order_id,r]));
 return json({orders:orders.map(o=>({...o,reference:byOrder.get(o.id)?.reference??null,refunded_at:byOrder.get(o.id)?.created??null}))});
}
export async function POST(req){try{
 if(!sameOrigin(req))return json({error:'Origin'},403);
 const u=await getAppUser();if(u?.role!=='admin')return json({error:'Faqat admin'},403);
 const db=await getMongoDb(),b=await req.json(),o=await db.collection('orders').findOne({id:String(b.id)});
 if(!o)throw Error('Topilmadi');
 if(o.is_mock&&o.provider!=='cash')return json(await refundMock(env,o.id));
 const reference=String(b.reference||'').trim();
 if(b.confirmed!==true||reference.length<5||reference.length>300)throw Error('Xaridorga pul qaytarilganini tasdiqlang va hujjat raqamini kiriting');
 const amount=o.provider==='cash'?o.price*o.qty:o.deposit,prior=await db.collection('refund_records').findOne({order_id:o.id});
 if(prior){if(prior.reference!==reference)throw Error('Qaytarish avval boshqa hujjat bilan qayd etilgan');return json({ok:true});}
 if(!['refund_due','cash_refund_due'].includes(o.payment_state))throw Error('Buyurtma qaytarish navbatida emas');
 const now=Date.now(),client=await getMongoClient(),session=client.startSession();
 try{await session.withTransaction(async()=>{
  const live=await db.collection('orders').findOne({id:o.id},{session});
  if(!['refund_due','cash_refund_due'].includes(live?.payment_state))throw Error('Buyurtma qaytarish navbatida emas');
  await db.collection('refund_records').insertOne({order_id:o.id,amount,actor:u.userId,reference,created:now},{session});
  await db.collection('orders').updateOne({id:o.id,payment_state:live.payment_state},{$set:{payment_state:'refunded'}},{session});
  if(o.provider==='cash'&&await db.collection('partner_ledger').findOne({order_id:o.id,kind:'commission'},{session}))
   await db.collection('partner_ledger').updateOne({id:'refund-'+o.id},{$setOnInsert:{id:'refund-'+o.id,partner_id:o.partner_id,kind:'refund',amount:-o.commission_due,order_id:o.id,actor:u.userId,reference,created:now}},{upsert:true,session});
  await db.collection('notifications').updateOne({owner:o.buyer,kind:'refunded',entity:o.id},{$setOnInsert:{id:'refund-record-'+o.id,owner:o.buyer,kind:'refunded',entity:o.id,created:now,read_at:null}},{upsert:true,session});
  await db.collection('admin_events').insertOne({id:crypto.randomUUID(),actor:u.userId,target:o.id,action:'refund_record',note:JSON.stringify({amount,reference}),created:now},{session});
  await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
 });}catch(error){
  if(error?.code===11000){
   const duplicate=await db.collection('refund_records').findOne({order_id:o.id});
   if(duplicate?.reference===reference)return json({ok:true});
   if(duplicate)throw Error('Qaytarish avval boshqa hujjat bilan qayd etilgan');
  }
  throw error;
 }finally{await session.endSession();}
 return json({ok:true,message:'Tashqarida amalga oshirilgan qaytarish hisobga olindi. Sayt bank o‘tkazmasini bajarmadi.'});
 }catch(e){return json({error:e.message},400);}}
