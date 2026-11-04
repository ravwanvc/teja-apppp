import { getMongoDb,getMongoClient } from './mongodb.js';
import { incrementChanges } from './commerce.js';
import {freshness} from './partners.js';
import { capitalize } from "./format.js";
export async function growthData(_database,me){
 const db=await getMongoDb();
 const favorites=me?(await db.collection('favorites').find({user:me.id},{projection:{product:1}}).toArray()).map(f=>f.product):[];
 const reviews=await db.collection('reviews').find(me?.role==='admin'?{}:{$or:[{hidden:0},{hidden:false},{hidden:{$exists:false}}]},{projection:{order_id:1,product:1,rating:1,comment:1,hidden:1,created:1,_id:0}}).sort({created:-1}).limit(500).toArray();
 const sellers=me?.role==='admin'?await db.collection('users').find({role:'seller'},{projection:{id:1,name:1,verified:1,verification:1,business_name:1,business_contact:1,selling_paused:1,_id:0}}).sort({created:-1}).toArray():[];
 let report=null;
 if(me&&['seller','admin'].includes(me.role)){
  const products=await db.collection('products').find(me.role==='admin'?{}:{owner:me.id},{projection:{id:1}}).toArray();
  const match={status:'collected',provider:{$ne:'demo'},is_mock:{$ne:1}};
  match.product={$in:products.map(p=>p.id)};
  const orders=await db.collection('orders').find(match,{projection:{id:1,product:1,qty:1,price:1,deposit:1,provider:1,payment_state:1,commission_due:1,cart_items:1}}).toArray();
  report={orders_count:orders.length,units:0,revenue:0,commission:0};
  for(const o of orders){const items=Array.isArray(o.cart_items)?o.cart_items:JSON.parse(o.cart_items||'[]');report.units+=items.length?items.reduce((n,i)=>n+Number(i.qty),0):Number(o.qty||0);report.revenue+=o.price*o.qty;report.commission+=o.provider==='cash'&&o.payment_state!=='refunded'?o.commission_due:o.payment_state==='paid'?o.deposit:0;}
 }
 return{favorites,reviews,sellers,report};
}
export async function growthAction(_database,me,b){
 const db=await getMongoDb(),fail=m=>{throw Error(m);};
 const str=(v,max)=>typeof v==='string'&&v.trim()&&v.length<=max?v.trim():fail('Maydonlarni to‘g‘ri to‘ldiring');
 const int=(v,min,max)=>Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fail('Son noto‘g‘ri');
 if(b.action==='favorite'){
  const p=await db.collection('products').findOne({id:str(b.id,100)},{projection:{id:1}});if(!p)fail('Mahsulot topilmadi');
  if(b.saved===true)await db.collection('favorites').updateOne({user:me.id,product:p.id},{$setOnInsert:{id:me.id+':'+p.id,user:me.id,product:p.id,created:Date.now()}},{upsert:true});
  else if(b.saved===false)await db.collection('favorites').deleteOne({user:me.id,product:p.id});else fail('Amal noto‘g‘ri');
  return{ok:true};
 }
 if(b.action==='review'){
  const order=await db.collection('orders').findOne({id:str(b.id,100)}),product=order&&await db.collection('products').findOne({id:order.product});
  if(!order||order.buyer!==me.id||order.status!=='collected'||order.provider==='demo'||product?.owner===me.id)fail('Faqat o‘zingiz olgan haqiqiy buyurtmaga baho berishingiz mumkin');
  if(await db.collection('reviews').findOne({order_id:order.id},{projection:{_id:1}}))fail('Bu buyurtmaga baho berilgan');
  const rating=int(b.rating,1,5),comment=str(b.comment,1000),now=Date.now(),client=await getMongoClient(),session=client.startSession();
  try{await session.withTransaction(async()=>{
   await db.collection('reviews').insertOne({order_id:order.id,product:order.product,buyer:me.id,rating,comment,hidden:0,created:now},{session});
   if(product?.owner)await db.collection('notifications').updateOne({owner:product.owner,kind:'review',entity:order.id},{$setOnInsert:{id:crypto.randomUUID(),owner:product.owner,kind:'review',entity:order.id,created:now,read_at:null}},{upsert:true,session});
   await incrementChanges(db,session);
  });}catch(e){if(e.code===11000)fail('Bu buyurtmaga baho berilgan');throw e;}finally{await session.endSession();}
  return{ok:true};
 }
 if(b.action==='moderateReview'){
  if(me.role!=='admin')fail('Faqat admin uchun');if(typeof b.hidden!=='boolean')fail('Amal noto‘g‘ri');
  const r=await db.collection('reviews').updateOne({order_id:str(b.id,100)},{$set:{hidden:b.hidden?1:0}});
  if(r.modifiedCount)await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1,version:0},$inc:{version:1}},{upsert:true});
  return{ok:true};
 }
 if(b.action==='requestVerification'){
  if(me.verified)fail('Sotuvchi allaqachon tasdiqlangan');
  await db.collection('users').updateOne({id:me.id,verified:{$in:[0,false]}},{$set:{business_name:str(b.name,100),business_contact:str(b.contact,150),verification:'pending'}});
  await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1,version:0},$inc:{version:1}},{upsert:true});
  return{ok:true};
 }
 if(b.action==='verifySeller'){
  if(me.role!=='admin')fail('Faqat admin uchun');if(typeof b.approved!=='boolean')fail('Amal noto‘g‘ri');
  const id=str(b.id,100),verification=b.approved?'approved':'rejected',now=Date.now(),client=await getMongoClient(),session=client.startSession();let changed=false;
  try{await session.withTransaction(async()=>{
   const r=await db.collection('users').updateOne({id,role:'seller',verification:{$ne:'none'}},{$set:{verified:b.approved?1:0,verification}},{session});
   changed=!!r.modifiedCount;if(!changed)return;
   await db.collection('notifications').updateOne({owner:id,kind:'seller_'+verification,entity:id},{$setOnInsert:{id:crypto.randomUUID(),owner:id,kind:'seller_'+verification,entity:id,created:now,read_at:null}},{upsert:true,session});
   await incrementChanges(db,session);
  });}finally{await session.endSession();}
  if(!changed)fail('Ariza topilmadi');return{ok:true};
 }
 if(['editProduct','restock'].includes(b.action)){
  const id=str(b.id,100),p=await db.collection('products').findOne({id});
  if(!p||(p.owner!==me.id&&me.role!=='admin'))fail('Bu mahsulotni boshqarishga ruxsat yo‘q');
  if(b.action==='restock'){
   const qty=int(b.qty,1,10000),key=str(b.requestId,100),prior=await db.collection('stock_events').findOne({id:key});
   if(prior){if(prior.actor!==me.id||prior.product!==p.id)fail('So‘rov mos emas');return{ok:true};}
   if(p.until<=Date.now())fail('Avval mahsulotning yangi muddatini belgilang');
   const now=Date.now(),client=await getMongoClient(),session=client.startSession();
   try{await session.withTransaction(async()=>{
    const already=await db.collection('stock_events').findOne({id:key},{session});if(already){if(already.actor!==me.id||already.product!==p.id)fail('So‘rov mos emas');return;}
    await db.collection('stock_events').insertOne({id:key,product:p.id,actor:me.id,qty,created:now},{session});
    const fresh=await db.collection('products').findOneAndUpdate({id:p.id,until:{$gt:now}},{$inc:{stock:qty}},{returnDocument:'before',session});
    if(!fresh)fail('Avval mahsulotning yangi muddatini belgilang');
    if(fresh.stock===0&&p.active&&p.until>now){
     const waiters=await db.collection('waitlist').find({product:p.id},{session}).toArray();
     for(const w of waiters)await db.collection('notifications').updateOne({owner:w.owner,kind:'available',entity:p.id},{$setOnInsert:{id:crypto.randomUUID(),owner:w.owner,kind:'available',entity:p.id,created:now,read_at:null}},{upsert:true,session});
     await db.collection('waitlist').deleteMany({product:p.id},{session});
    }
    await incrementChanges(db,session);
   });}finally{await session.endSession();}
   return{ok:true};
  }
  const v=b.product,price=int(v.price,100,100000000),original=int(v.original,price+1,100000000),until=int(v.until,Date.now()+60000,Date.now()+30*86400000),food=freshness(v,until);
  if(await db.collection('orders').findOne({product:p.id,status:{$in:['reserved','pending_payment']}},{projection:{_id:1}}))fail('Faol buyurtma bor. Avval uni topshiring yoki bekor qiling');
  const update={$set:{title:capitalize(str(v.title,100)),price,original,until,allergens:str(v.allergens,250),storage:str(v.storage,250),prepared_at:food.prepared,best_before:food.best}};
  const changed=await db.collection('products').updateOne({id:p.id},update);
  if(!changed.modifiedCount)fail('Faol buyurtma bor. Avval uni topshiring yoki bekor qiling');
  await db.collection('change_version').updateOne({id:1},{$setOnInsert:{id:1,version:0},$inc:{version:1}},{upsert:true});
  return{ok:true};
 }
 return null;
}
