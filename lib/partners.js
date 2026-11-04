import { getMongoDb,getMongoClient } from './mongodb.js';
import {prepareCart} from './cart.js';
import {incrementChanges} from './commerce.js';
export function freshness(p,until,now=Date.now()){
 const prepared=p.prepared_at===''||p.prepared_at==null?null:Number(p.prepared_at),best=p.best_before===''||p.best_before==null?null:Number(p.best_before);
 if(prepared===null&&best===null)return{prepared:null,best:null};
 if(!Number.isSafeInteger(prepared)||!Number.isSafeInteger(best)||prepared>now+300000||prepared<=0||best<=prepared||best<=now||until>best)throw Error('Tayyorlangan vaqt va iste’mol muddatini tekshiring. Olish muddati iste’mol muddatidan kech bo‘lmasin.');
 return{prepared,best};
}
export async function cashCheckout(_database,me,b){
 const db=await getMongoDb();
 if(b.acceptTerms!==true)throw Error('Olib ketish shartini tasdiqlang');
 const id=String(b.requestId||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('So‘rov identifikatori noto‘g‘ri');
 const input=b.items||[{id:b.id,qty:Number(b.qty)}],prior=await db.collection('orders').findOne({id});
 if(prior){const old=Array.isArray(prior.cart_items)?prior.cart_items:JSON.parse(prior.cart_items||'[]'),norm=v=>JSON.stringify(v.map(p=>[p.id,p.qty]).sort((a,b)=>a[0].localeCompare(b[0])));if(prior.buyer!==me.id||prior.provider!=='cash'||!Array.isArray(input)||norm(input)!==norm(old))throw Error('So‘rov mos emas');return{ok:true,id,receiptReady:true};}
 if(await db.collection('orders').countDocuments({buyer:me.id,provider:'cash',status:'reserved'})>=3)throw Error('Avval faol naqd buyurtmalaringizni olib keting yoki bekor qiling');
 const cart=await prepareCart(db,input,me.id),p=cart.items[0],now=Date.now();
 const [partner,seller]=await Promise.all([
  db.collection('partner_businesses').findOne({owner:p.owner,enabled:{$in:[1,true]}}),
  db.collection('users').findOne({id:p.owner}),
 ]);
 if(!partner||!seller||seller.selling_paused)throw Error('Ushbu do‘kon uchun naqd to‘lov yoqilmagan');
 const order={id,buyer:me.id,product:p.id,qty:1,price:cart.total,code:crypto.randomUUID().slice(0,8).toUpperCase(),status:'reserved',created:now,payment_state:'cash_due',provider:'cash',deposit:0,pickup_at:Math.min(now+30*60000,cart.until),snapshot:JSON.stringify({title:cart.items.map(x=>x.title).join(', '),shop:p.shop,address:p.address,image:p.image,allergens:p.allergens,storage:p.storage,lat:p.lat,lng:p.lng,prepared_at:p.prepared_at,best_before:p.best_before,until:cart.until}),terms_at:now,is_mock:0,cart_items:JSON.stringify(cart.items),partner_id:partner.id,commission_rate:partner.rate_bps,commission_due:Math.ceil(cart.total*partner.rate_bps/10000)};
 const client=await getMongoClient(),session=client.startSession();
 try{await session.withTransaction(async()=>{
  if(await db.collection('orders').countDocuments({buyer:me.id,provider:'cash',status:'reserved'},{session})>=3)throw Error('Avval faol naqd buyurtmalaringizni olib keting yoki bekor qiling');
  for(const item of cart.items){
   const changed=await db.collection('products').updateOne({id:item.id,active:{$in:[true,1]},stock:{$gte:item.qty},price:item.price,until:{$gt:now}},{$inc:{stock:-item.qty}},{session});
   if(!changed.modifiedCount)throw Error('stock unavailable');
  }
  const counter=await db.collection('receipt_counters').findOneAndUpdate({kind:'cash'},{$inc:{value:1},$setOnInsert:{kind:'cash'}},{upsert:true,returnDocument:'after',session});
  order.receipt_no='C-'+counter.value;
  await db.collection('orders').insertOne(order,{session});
  await db.collection('notifications').updateOne({owner:p.owner,kind:'new_order',entity:id},{$setOnInsert:{id:crypto.randomUUID(),owner:p.owner,kind:'new_order',entity:id,created:now,read_at:null}},{upsert:true,session});
  await incrementChanges(db,session);
 });}finally{await session.endSession();}
 return{ok:true,id,receiptReady:true,message:'Bron tayyor. To‘liq summa do‘konda naqd to‘lanadi.'};
}
export async function reorderPreview(_database,me,id){
 const db=await getMongoDb(),o=await db.collection('orders').findOne({id:String(id),buyer:me.id});if(!o)throw Error('Buyurtma topilmadi');
 let old=Array.isArray(o.cart_items)?o.cart_items:JSON.parse(o.cart_items||'[]');if(!old.length)old.push({id:o.product,qty:o.qty,price:o.price});
 const items=[],changes=[];
 for(const row of old){
  const p=await db.collection('products').findOne({id:row.id}),user=p&&await db.collection('users').findOne({id:p.owner},{projection:{selling_paused:1}});
  if(!p||!p.active||p.stock<1||p.until<Date.now()+600000||user?.selling_paused||(p.best_before&&p.best_before<=Date.now())){changes.push((row.title||'Mahsulot')+': hozir mavjud emas');continue;}
  const qty=Math.min(row.qty,p.stock);items.push({...p,qty});if(qty!==row.qty||p.price!==row.price)changes.push(p.title+': narx yoki miqdor yangilandi');
 }
 return{items,changes};
}
