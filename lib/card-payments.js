import { cardsConfigured, subscribe } from "./payme-subscribe.js";
import { getMongoDb,getMongoClient } from "./mongodb.js";
export const cardPaymentsConfigured=e=>cardsConfigured(e)&&e.SUBSCRIBE_PAYMENTS_READY==="true";
const note="Karta to‘lovi tekshirilmoqda. Qayta pul yechishga urinilmaydi. Buyurtmalarim bo‘limida holatni tekshiring.";
const pending=id=>({ok:true,id,cardPayment:"pending",message:note});
const row=(db,id)=>db.collection("card_charges").findOne({order_id:id});
async function getOrder(db,id){
 const o=await db.collection("orders").findOne({id});if(!o)return null;
 const p=await db.collection("products").findOne({id:o.product},{projection:{until:1,owner:1}});
 if(!p)return null;
 return{...o,until:p?.until,owner:p?.owner};
}
function validateReceipt(e,r,o,receiptId){
 const account=Array.isArray(r?.account)?r.account.find(a=>a.name==="order_id")?.value:r?.account?.order_id;
 if(!r||typeof r._id!=="string"||r._id.length>100||(receiptId&&r._id!==receiptId)||r.amount!==o.deposit*100||String(account)!==o.id||r.merchant?._id!==e.PAYME_SUBSCRIBE_ID||(r.currency!==undefined&&r.currency!==860))throw Error("Provayder javobi buyurtmaga mos emas");
}
async function transaction(db,work){
 const client=await getMongoClient(),session=client.startSession();
 try{let out;await session.withTransaction(async()=>{out=await work(session);});return out;}finally{await session.endSession();}
}
async function notify(db,o,kind,now,session){
 const product=await db.collection("products").findOne({id:o.product},{projection:{owner:1},session});
 for(const owner of [o.buyer,product?.owner].filter(Boolean)){
  const r=await db.collection("notifications").updateOne({owner,kind,entity:o.id},{$setOnInsert:{id:crypto.randomUUID(),owner,kind,entity:o.id,created:now,read_at:null}},{upsert:true,session});
  if(r.upsertedCount)await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
 }
}
async function restoreStock(db,o,session){
 const items=Array.isArray(o.cart_items)?o.cart_items:JSON.parse(o.cart_items||"[]"),lines=items.length?items:[{id:o.product,qty:o.qty}];
 for(const item of lines)await db.collection("products").updateOne({id:item.id},{$inc:{stock:item.qty}},{session});
}
async function outcome(e,db,o,c,r){
 validateReceipt(e,r,o,c.receipt_id);
 if(r.state===4){
  if(!Number.isSafeInteger(r.pay_time)||r.pay_time<o.created-60000||r.pay_time>Date.now()+60000)throw Error("To‘lov vaqti noto‘g‘ri");
  const now=Date.now();
  await transaction(db,async session=>{
   const current=await db.collection("card_charges").findOne({order_id:o.id,status:"paying"},{session});
   if(!current)return false;
   const live=await db.collection("orders").findOne({id:o.id,status:"pending_payment",payment_state:"unpaid"},{session});
   const product=await db.collection("products").findOne({id:o.product},{session});
   if(!live||!product)throw Error("card payment state changed");
   const updated=await db.collection("card_charges").updateOne({order_id:o.id,status:"paying"},{$set:{status:"paid",paid_at:r.pay_time,updated:now}},{session});
   if(!updated.modifiedCount)return false;
   const counter=await db.collection("receipt_counters").findOneAndUpdate({kind:"paid"},{$inc:{value:1},$setOnInsert:{kind:"paid"}},{upsert:true,returnDocument:"after",session});
   const pickup=Math.min(now+1800000,product?.until||now);
   await db.collection("orders").updateOne({id:o.id,status:"pending_payment",payment_state:"unpaid"},{$set:{payment_state:"paid",transaction_id:"subscribe:"+c.receipt_id,paid_at:r.pay_time,status:"reserved",pickup_at:pickup,receipt_no:counter.value}},{session});
   if(product?.until<=now){
    await db.collection("orders").updateOne({id:o.id,status:"reserved"},{$set:{status:"cancelled",payment_state:"refund_due"}},{session});
    await restoreStock(db,live,session);
    await notify(db,{...live,status:"cancelled"}, "cancelled",now,session);
   }
   await notify(db,{...live,status:"reserved",payment_state:"paid"},"paid",r.pay_time,session);
   await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
   return true;
  });
  const settled=await db.collection("orders").findOne({id:o.id});
  if(!["paid","refund_due"].includes(settled?.payment_state))return pending(o.id);
  return{ok:true,id:o.id,cardPayment:"paid",message:settled.payment_state==="refund_due"?"To‘lov tasdiqlandi, lekin mahsulot muddati o‘tgan. Qaytarish uchun qayd ochildi.":"10% to‘lov tasdiqlandi. Buyurtma cheki tayyor."};
 }
 if(r.state===50){
  await transaction(db,async session=>{
   const charge=await db.collection("card_charges").updateOne({order_id:o.id,status:"paying"},{$set:{status:"failed",updated:Date.now()}},{session});
   if(!charge.modifiedCount)return;
   const live=await db.collection("orders").findOne({id:o.id,status:"pending_payment"},{session});
   if(live){await db.collection("orders").updateOne({id:o.id,status:"pending_payment"},{$set:{status:"cancelled"}},{session});await restoreStock(db,live,session);await notify(db,{...live,status:"cancelled"},"cancelled",Date.now(),session);await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});}
  });
  return{ok:true,id:o.id,cardPayment:"failed",message:"Provayder to‘lov bekor qilinganini tasdiqladi. Qoldiq qaytarildi."};
 }
 return pending(o.id);
}
export async function reconcileCardPayment(e,owner,id,admin=false){
 const db=await getMongoDb(),o=await getOrder(db,id);
 if(!o||(!admin&&o.buyer!==owner)||o.provider!=="card")throw Error("Buyurtma topilmadi yoki ruxsat yo‘q");
 const c=await row(db,id);
 if(c?.status==="paid")return{ok:true,id,cardPayment:"paid",message:"To‘lov avval tasdiqlangan. Yangi pul yechilmadi."};
 if(c?.status==="failed")return{ok:true,id,cardPayment:"failed",message:"Karta to‘lovi yakunlanmagan. Yangi buyurtma oching."};
 if(!c?.receipt_id||c.status!=="paying")return pending(id);
 try{const{receipt}=await subscribe(e,"receipts.get",{id:c.receipt_id});return await outcome(e,db,o,c,receipt);}catch{return pending(id);}
}
export async function chargeCardPayment(e,owner,id,cardId){
 if(!cardPaymentsConfigured(e))throw Error("Karta orqali to‘lov hali ulanmagan");
 const db=await getMongoDb(),o=await getOrder(db,id);
 if(!o||o.buyer!==owner||o.provider!=="card")throw Error("Buyurtma topilmadi");
 const card=await db.collection("saved_cards").findOne({id:String(cardId||""),owner});
 if(!card)throw Error("Karta hisobingizga tegishli emas");
 let c=await row(db,id);
 if(c&&c.card_id!==card.id)throw Error("Bu buyurtma uchun boshqa karta tanlangan. Holatini tekshiring.");
 if(["paid","paying","failed"].includes(c?.status))return reconcileCardPayment(e,owner,id);
 if(o.status!=="pending_payment"||o.payment_state!=="unpaid"||o.hold_until<=Date.now())throw Error("To‘lov muddati tugagan");
 if(!c){
  const now=Date.now();
  try{await db.collection("card_charges").insertOne({order_id:id,card_id:card.id,status:"creating",updated:now,created:now});}
  catch{return pending(id);}
  try{
   const{card:checked}=await subscribe(e,"cards.check",{token:card.token});
   if(checked?.verify!==true||checked.recurrent!==true)throw Error("Karta tasdiqlanmagan");
   const{receipt}=await subscribe(e,"receipts.create",{amount:o.deposit*100,account:{order_id:id},description:"TEJA 10% oldindan to‘lov"});
   validateReceipt(e,receipt,o);
   if(receipt.state!==0)throw Error("Yangi chek holati noto‘g‘ri");
   await db.collection("card_charges").updateOne({order_id:id,status:"creating"},{$set:{receipt_id:receipt._id,status:"created",updated:Date.now()}});
   c=await row(db,id);
  }catch{
   await transaction(db,async session=>{
    await db.collection("card_charges").updateOne({order_id:id,status:"creating"},{$set:{status:"failed",updated:Date.now()}},{session});
    const live=await db.collection("orders").findOne({id,status:"pending_payment"},{session});
    if(live){await db.collection("orders").updateOne({id,status:"pending_payment"},{$set:{status:"cancelled"}},{session});await restoreStock(db,live,session);await notify(db,{...live,status:"cancelled"},"cancelled",Date.now(),session);await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});}
   });
   return{ok:true,id,cardPayment:"failed",message:"Karta yoki to‘lov cheki tasdiqlanmadi. Pul yechish so‘rovi yuborilmadi."};
  }
 }
 if(c?.status!=="created")return pending(id);
 const locked=await transaction(db,async session=>{
  const live=await db.collection("orders").findOne({id,status:"pending_payment",payment_state:"unpaid",hold_until:{$gt:Date.now()}},{session});
  const product=live&&await db.collection("products").findOne({id:live.product,until:{$gt:Date.now()}},{session});
  if(!live||!product)return false;
  return!!(await db.collection("card_charges").updateOne({order_id:id,status:"created"},{$set:{status:"paying",updated:Date.now()}},{session})).modifiedCount;
 });
 if(!locked){
  const latest=await getOrder(db,id);
  return latest.status==="pending_payment"?pending(id):{ok:true,id,cardPayment:"failed",message:"Buyurtma muddati tugagan yoki bekor qilingan. Pul yechish so‘rovi yuborilmadi."};
 }
 try{const{receipt}=await subscribe(e,"receipts.pay",{id:c.receipt_id,token:card.token});return await outcome(e,db,o,{...c,status:"paying"},receipt);}catch{return pending(id);}
}
