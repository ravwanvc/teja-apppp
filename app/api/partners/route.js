import { getMongoDb,getMongoClient } from '../../../lib/mongodb.js';
import { incrementChanges } from '../../../lib/commerce.js';
import {getAppUser,sameOrigin} from '../../../lib/auth.js';
const json=(v,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const text=(v,max=500)=>String(v||'').trim().slice(0,max);
const stamp=()=>Date.now();
export async function GET(req){try{
 const db=await getMongoDb(),q=new URL(req.url).searchParams;
 if(q.has('owner')){
  const b=await db.collection('partner_businesses').findOne({owner:q.get('owner'),enabled:{$in:[1,true]}});
  const seller=b&&await db.collection('users').findOne({id:b.owner,selling_paused:{$in:[0,false]}});
  const active=!!b&&!!seller;return json({cash:active,name:active?b.name:undefined});
 }
 const u=await getAppUser();if(!u||!['admin','seller'].includes(u.role))return json({error:'Ruxsat yo‘q'},403);
 const businesses=await db.collection('partner_businesses').find(u.role==='admin'?{}:{owner:u.userId},{projection:{_id:0}}).sort({created:-1}).toArray();
 const owners=[...new Set(businesses.map(b=>b.owner).filter(Boolean))],partners=businesses.map(b=>b.id);
 const [users,ledgerRows,completedRows]=await Promise.all([
  db.collection('users').find({id:{$in:owners}}).project({id:1,name:1,selling_paused:1}).toArray(),
  db.collection('partner_ledger').find({partner_id:{$in:partners}}).toArray(),
  db.collection('orders').find({partner_id:{$in:partners},status:'collected'}).project({id:1,partner_id:1}).toArray(),
 ]);
 const userMap=new Map(users.map(x=>[x.id,x])),totals=new Map(),complete=new Map();
 for(const l of ledgerRows){const t=totals.get(l.partner_id)||{balance:0,accrued:0,settled:0,reversed:0};t.balance+=l.amount;if(l.kind==='commission')t.accrued+=l.amount;if(l.kind==='settlement')t.settled-=l.amount;if(l.kind==='refund')t.reversed-=l.amount;totals.set(l.partner_id,t);}
 for(const o of completedRows)complete.set(o.partner_id,(complete.get(o.partner_id)||0)+1);
 const selected=q.get('id'),allowed=businesses.some(b=>b.id===selected),ledger=selected&&allowed?await db.collection('partner_ledger').aggregate([{$match:{partner_id:selected}},{$sort:{created:-1}},{$limit:200},{$lookup:{from:'users',localField:'actor',foreignField:'id',as:'_actor'}},{$unwind:{path:'$_actor',preserveNullAndEmptyArrays:true}},{$addFields:{actor_name:'$_actor.name'}},{$project:{_id:0,_actor:0}}]).toArray():[];
 const orders=selected&&allowed?await db.collection('orders').find({partner_id:selected},{projection:{id:1,receipt_no:1,price:1,qty:1,status:1,payment_state:1,created:1,commission_due:1,commission_rate:1,pickup_at:1,_id:0}}).sort({created:-1}).limit(200).toArray():[];
 const sellers=u.role==='admin'?await db.collection('users').find({role:'seller'},{projection:{_id:0,id:1,name:1,business_name:1,selling_paused:1}}).sort({name:1}).toArray():[];
 const events=u.role==='admin'?await db.collection('admin_events').aggregate([{$sort:{created:-1}},{$limit:50},{$lookup:{from:'users',localField:'actor',foreignField:'id',as:'_actor'}},{$unwind:{path:'$_actor',preserveNullAndEmptyArrays:true}},{$addFields:{actor_name:'$_actor.name'}},{$project:{_id:0,_actor:0}}]).toArray():[];
 return json({businesses:businesses.map(b=>({...b,seller:userMap.get(b.owner)?.name??null,selling_paused:userMap.get(b.owner)?.selling_paused||0,...(totals.get(b.id)||{balance:0,accrued:0,settled:0,reversed:0}),completed:complete.get(b.id)||0})),ledger,orders,sellers,events});
 }catch{return json({error:'Hisob yuklanmadi. Migratsiyalarni tekshiring.'},500);}}
export async function POST(req){try{
 if(!sameOrigin(req))return json({error:'Origin'},403);
 const u=await getAppUser();if(u?.role!=='admin')return json({error:'Faqat admin'},403);
 const db=await getMongoDb(),b=await req.json(),now=stamp(),client=await getMongoClient();
 if(b.action==='save'){
  const id=text(b.id,80)||crypto.randomUUID(),name=text(b.name,100),contact=text(b.contact,100),address=text(b.address),owner=text(b.owner,100)||null,rate=Number(b.rate_bps);
  if(!name||!contact||!address||!Number.isSafeInteger(rate)||rate<0||rate>10000)throw Error('Nom, aloqa, manzil va komissiyani to‘g‘ri kiriting');
  if(owner&&!await db.collection('users').findOne({id:owner,role:'seller'},{projection:{_id:1}}))throw Error('Ro‘yxatdan o‘tgan sotuvchini tanlang');
  const prior=await db.collection('partner_businesses').findOne({id});
  if(prior&&prior.owner!==owner&&await db.collection('orders').findOne({partner_id:id},{projection:{_id:1}}))throw Error('Buyurtmasi bor hamkorning sotuvchi hisobini almashtirib bo‘lmaydi');
  const session=client.startSession();try{await session.withTransaction(async()=>{
   const set={name,contact,address,rate_bps:rate,enabled:b.enabled===false?0:1,updated:now};
   const update={$set:set,$setOnInsert:{id,created:now}};
   if(owner)update.$set.owner=owner;else update.$unset={owner:''};
   await db.collection('partner_businesses').updateOne({id},update,{upsert:true,session});
   await db.collection('admin_events').insertOne({id:crypto.randomUUID(),actor:u.userId,target:id,action:'partner_save',note:JSON.stringify({name,owner,rate,enabled:b.enabled!==false,previous:prior?{rate:prior.rate_bps,enabled:prior.enabled}:null}),created:now},{session});
  });}finally{await session.endSession();}
  return json({ok:true,id});
 }
 if(b.action==='settle'){
  const id=text(b.requestId,80),partner=text(b.id,80),amount=Number(b.amount),reference=text(b.reference,300);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(id)||!Number.isSafeInteger(amount)||amount<=0||reference.length<4||b.confirmed!==true)throw Error('Qabul qilingan summa, kassa hujjati va tasdiqni kiriting');
  const session=client.startSession();try{await session.withTransaction(async()=>{
   const ledger=db.collection('partner_ledger'),prior=await ledger.findOne({id},{session});
   if(prior){if(prior.kind!=='settlement'||prior.partner_id!==partner||prior.amount!==-amount||prior.reference!==reference)throw Error('So‘rov mos emas');return;}
   const business=await db.collection('partner_businesses').findOne({id:partner},{session});if(!business)throw Error('Summa mavjud komissiya qarzidan katta yoki hamkor topilmadi');
   await db.collection('partner_businesses').updateOne({id:partner},{$inc:{settlement_version:1}},{session});
   const all=await ledger.find({partner_id:partner},{session,projection:{amount:1}}).toArray(),balance=all.reduce((n,x)=>n+x.amount,0);
   if(amount>balance)throw Error('Summa mavjud komissiya qarzidan katta yoki hamkor topilmadi');
   await ledger.insertOne({id,partner_id:partner,kind:'settlement',amount:-amount,actor:u.userId,reference,created:now},{session});
  });}catch(error){
   if(error?.code===11000){const prior=await db.collection('partner_ledger').findOne({id});if(prior?.kind==='settlement'&&prior.partner_id===partner&&prior.amount===-amount&&prior.reference===reference)return json({ok:true});if(prior)throw Error('So‘rov mos emas');}
   throw error;
  }finally{await session.endSession();}
  return json({ok:true});
 }
 if(b.action==='restrict'){
  const id=text(b.id,100),reason=text(b.reason,1000);if(reason.length<5||typeof b.paused!=='boolean')throw Error('Sababini yozing');
  if(!await db.collection('users').findOne({id,role:'seller'},{projection:{_id:1}}))throw Error('Sotuvchi topilmadi');
  const session=client.startSession();try{await session.withTransaction(async()=>{
   await db.collection('users').updateOne({id,role:'seller'},{$set:{selling_paused:b.paused?1:0}},{session});
   if(b.paused)await db.collection('products').updateMany({owner:id},{$set:{active:0}},{session});
   await db.collection('admin_events').insertOne({id:crypto.randomUUID(),actor:u.userId,target:id,action:b.paused?'seller_pause':'seller_resume',note:reason,created:now},{session});
   await incrementChanges(db,session);
  });}finally{await session.endSession();}
  return json({ok:true});
 }
 throw Error('Noma’lum amal');
 }catch(e){return json({error:/UNIQUE|E11000/.test(e.message)?'Bu sotuvchi boshqa hamkorga biriktirilgan':e.message},400);}}
