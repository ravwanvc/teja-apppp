import { mockPayments } from "./modes.js";
import { createHash } from "node:crypto";
import { cardPaymentsConfigured } from "./card-payments.js";
import { equal } from "./password.js";
import { getMongoDb,getMongoClient } from "./mongodb.js";
export const paymentConfig=e=>mockPayments(e)?{card:true,payme:true,click:true}:{card:cardPaymentsConfigured(e),payme:!!(e.PAYME_MERCHANT_ID&&e.PAYME_MERCHANT_KEY&&e.PAYMENT_CALLBACKS_READY==="true"),click:!!(e.CLICK_MERCHANT_ID&&e.CLICK_SERVICE_ID&&e.CLICK_SECRET_KEY&&e.PAYMENT_CALLBACKS_READY==="true")};
export function paymentUrl(e,provider,id,amount,origin){
 const back=origin+"/?view=orders";
 if(provider==="payme")return"https://checkout.paycom.uz/"+btoa(`m=${e.PAYME_MERCHANT_ID};ac.order_id=${id};a=${amount*100};l=uz;c=${back}`);
 return"https://my.click.uz/services/pay?"+new URLSearchParams({service_id:e.CLICK_SERVICE_ID,merchant_id:e.CLICK_MERCHANT_ID,amount:String(amount),transaction_param:id,return_url:back});
}
const txResult=t=>({transaction:t.order_id,create_time:t.created,perform_time:t.performed,cancel_time:t.cancelled,state:t.state,reason:t.reason});
const error=(code,message,data)=>{throw{code,message:{uz:message,ru:message,en:message},...(data?{data}:{}),_providerError:true};};
async function transaction(db,work){
 const client=await getMongoClient(),session=client.startSession();
 try{let result;await session.withTransaction(async()=>{result=await work(session);});return result;}finally{await session.endSession();}
}
async function notify(db,owner,kind,entity,created,session){
 if(!owner)return;
 const result=await db.collection("notifications").updateOne({owner,kind,entity},{$setOnInsert:{id:crypto.randomUUID(),owner,kind,entity,created,read_at:null}},{upsert:true,session});
 if(result.upsertedCount)await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
}
async function notifyOrder(db,o,owner,kind,now,session){await notify(db,o.buyer,kind,o.id,now,session);await notify(db,owner,kind,o.id,now,session);}
async function order(db,id,amount,provider){
 const o=await db.collection("orders").findOne({id:String(id||"")});
 if(!o||o.provider!==provider)error(-31050,"Buyurtma topilmadi","order_id");
 if(o.deposit!==amount)error(-31001,"Summa mos emas");
 return o;
}
function canPay(o){if(o.payment_state!=="unpaid"||o.status!=="pending_payment"||o.hold_until<=Date.now())error(-31008,"Buyurtma faol emas");}
const getTx=(db,provider,id)=>db.collection("payment_transactions").findOne({id:provider+":"+id});
async function makeTx(db,provider,pid,o,providerTime){
 const id=provider+":"+pid;
 try{await db.collection("payment_transactions").insertOne({id,provider,provider_id:String(pid),order_id:o.id,amount:o.deposit,provider_time:providerTime,created:Date.now(),performed:0,cancelled:0,state:1});}
 catch{const t=await getTx(db,provider,pid);if(!t||t.order_id!==o.id||t.amount!==o.deposit)error(-31008,"Tranzaksiya allaqachon mavjud");}
 return getTx(db,provider,pid);
}
async function perform(db,t){
 if(t.state===2)return t;if(t.state!==1)error(-31008,"Tranzaksiya bekor qilingan");
 const now=Date.now();
 try{
  return await transaction(db,async session=>{
   const current=await db.collection("payment_transactions").findOne({id:t.id},{session});if(!current||current.state!==1){if(current?.state===2)return current;error(-31008,"Tranzaksiya bekor qilingan");}
   const o=await db.collection("orders").findOne({id:current.order_id},{session}),p=o&&await db.collection("products").findOne({id:o.product},{session});
   if(!o||!p||o.status!=="pending_payment"||o.payment_state!=="unpaid"||o.provider!==current.provider||o.deposit!==current.amount||o.hold_until<=now||p.until<=now)error(-31008,"To‘lov muddati tugagan yoki buyurtma o‘zgargan");
   const updated=await db.collection("payment_transactions").updateOne({id:t.id,state:1},{$set:{state:2,performed:now}},{session});
   if(!updated.modifiedCount)error(-31008,"Tranzaksiya bekor qilingan");
   const payment_state=o.is_mock?"test":"paid",receiptKind=payment_state;
   const counter=await db.collection("receipt_counters").findOneAndUpdate({kind:receiptKind},{$inc:{value:1},$setOnInsert:{kind:receiptKind}},{upsert:true,returnDocument:"after",session});
   const status="reserved",pickup_at=Math.min(now+1800000,p.until);
   const changed=await db.collection("orders").updateOne({id:o.id,status:"pending_payment",payment_state:"unpaid"},{$set:{payment_state,transaction_id:current.id,paid_at:now,status,pickup_at,receipt_no:counter.value}},{session});
   if(!changed.modifiedCount)error(-31008,"To‘lov muddati tugagan yoki buyurtma o‘zgargan");
   await notifyOrder(db,{...o,payment_state,status},p.owner,"paid",now,session);
   await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
   return{...current,state:2,performed:now};
  });
 }catch(e){if(e.code)throw e;error(-31008,"To‘lov muddati tugagan yoki buyurtma o‘zgargan");}
}
async function cancel(db,t,reason){
 if(t.state<0)return t;
 try{return await transaction(db,async session=>{
  const current=await db.collection("payment_transactions").findOne({id:t.id},{session});if(!current||current.state<=0)return current||t;
  const o=await db.collection("orders").findOne({id:current.order_id},{session});
  if(o?.status==="collected")error(-31007,"Mahsulot topshirilgan");
  const updated=await db.collection("payment_transactions").updateOne({id:t.id,state:{$gt:0}},{$set:{state:current.state===2?-2:-1,cancelled:Date.now(),reason}},{session});
  if(!updated.modifiedCount)return current;
  if(o){
   const p=await db.collection("products").findOne({id:o.product},{session}),nextStatus=["pending_payment","reserved"].includes(o.status)?"cancelled":o.status,nextPayment=current.state===2?"refunded":o.payment_state;
   await db.collection("orders").updateOne({id:o.id,status:o.status,payment_state:o.payment_state},{$set:{status:nextStatus,payment_state:nextPayment}},{session});
   if(nextStatus!==o.status&&["pending_payment","reserved"].includes(o.status)){
    const items=Array.isArray(o.cart_items)?o.cart_items:JSON.parse(o.cart_items||"[]"),lines=items.length?items:[{id:o.product,qty:o.qty}];
    for(const line of lines)await db.collection("products").updateOne({id:line.id},{$inc:{stock:line.qty}},{session});
   }
   if(nextStatus!==o.status)await notifyOrder(db,{...o,status:nextStatus},p?.owner,nextStatus,Date.now(),session);
   if(nextPayment==="refunded"&&o.payment_state!=="refunded")await notify(db,o.buyer,"refunded",o.id,Date.now(),session);
   await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true,session});
  }
  return{...current,state:current.state===2?-2:-1,cancelled:Date.now(),reason};
 });}catch(e){if(e.code)throw e;error(-31007,"Mahsulot topshirilgan");}
}
export async function paymeCallback(_database,e,auth,b){
 const db=await getMongoDb(),id=b?.id??null;
 try{
  if(!e.PAYME_MERCHANT_KEY||!equal(auth,"Basic "+btoa("Paycom:"+e.PAYME_MERCHANT_KEY)))error(-32504,"Avtorizatsiya xatosi");
  const p=b.params||{};let result,t;
  if(["CheckPerformTransaction","CreateTransaction"].includes(b.method)){
   if(!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount%100)error(-31001,"Summa noto‘g‘ri");
   const o=await order(db,p.account?.order_id,p.amount/100,"payme");
   if(b.method==="CheckPerformTransaction"){canPay(o);result={allow:true};}
   else{
    if(typeof p.id!=="string"||p.id.length>100||!Number.isSafeInteger(p.time))error(-32600,"So‘rov noto‘g‘ri");
    t=await getTx(db,"payme",p.id);
    if(t){if(t.order_id!==o.id||t.amount!==o.deposit||t.state<0)error(-31008,"Tranzaksiya mos emas");}
    else{canPay(o);t=await makeTx(db,"payme",p.id,o,p.time);}
    result={create_time:t.created,transaction:t.order_id,state:t.state};
   }
  }else if(b.method==="GetStatement"){
   if(!Number.isSafeInteger(p.from)||!Number.isSafeInteger(p.to)||p.to<p.from)error(-32600,"Davr noto‘g‘ri");
   const rows=await db.collection("payment_transactions").find({provider:"payme",provider_time:{$gte:p.from,$lte:p.to}}).sort({provider_time:1}).toArray();
   result={transactions:rows.map(t=>({...txResult(t),id:t.provider_id,time:t.provider_time,amount:t.amount*100,account:{order_id:t.order_id}}))};
  }else if(["PerformTransaction","CancelTransaction","CheckTransaction"].includes(b.method)){
   t=await getTx(db,"payme",p.id);if(!t)error(-31003,"Tranzaksiya topilmadi");
   if(b.method==="PerformTransaction")t=await perform(db,t);
   if(b.method==="CancelTransaction"){if(!Number.isSafeInteger(p.reason))error(-32600,"Sabab noto‘g‘ri");t=await cancel(db,t,p.reason);}
   result=txResult(t);
  }else error(-32601,"Metod mavjud emas");
  return{jsonrpc:"2.0",id,result};
 }catch(err){
  if(!err?._providerError){
   const detail=String(err?.message||"").replace(/mongodb(?:\+srv)?:\/\/\S+/gi,"[redacted]").slice(0,200);
   console.error(`[teja] Payme mock/callback ${b?.method||"unknown"}: ${err?.name||"Error"} (${err?.code||"unknown"}) ${detail}`);
  }
  const providerResponse=err?{code:err.code,message:err.message,...(err.data?{data:err.data}:{})}:null;
  return{jsonrpc:"2.0",id,error:err?._providerError?providerResponse:{code:-32400,message:{uz:"Tizim xatosi",ru:"System error",en:"System error"}}};
 }
}
export function clickSignature(e,p){
 return createHash("md5").update(String(p.click_trans_id)+p.service_id+e.CLICK_SECRET_KEY+p.merchant_trans_id+(String(p.action)==="1"?p.merchant_prepare_id:"")+p.amount+p.action+p.sign_time).digest("hex");
}
export async function clickCallback(_database,e,p){
 const db=await getMongoDb(),base={click_trans_id:p.click_trans_id,merchant_trans_id:p.merchant_trans_id},fail=(n,m)=>({...base,error:n,error_note:m});
 try{
  if(!e.CLICK_SECRET_KEY||String(p.service_id)!==String(e.CLICK_SERVICE_ID)||!equal(clickSignature(e,p),p.sign_string))return fail(-1,"SIGN CHECK FAILED");
  if(!["0","1"].includes(String(p.action)))return fail(-3,"Action not found");
  if(!/^\d+$/.test(String(p.click_trans_id))||!/^\d+(\.\d{1,2})?$/.test(String(p.amount)))return fail(-2,"Invalid amount");
  const o=await order(db,p.merchant_trans_id,Number(p.amount),"click");let t=await getTx(db,"click",p.click_trans_id);
  if(t&&(t.order_id!==o.id||t.amount!==o.deposit))return fail(-6,"Transaction mismatch");
  if(String(p.action)==="0"){
   if(t?.state===2)return fail(-4,"Already paid");if(t?.state<0)return fail(-9,"Cancelled");canPay(o);if(Number(p.error)<0)return fail(-9,"Cancelled");
   t=t||(await makeTx(db,"click",p.click_trans_id,o,Date.now()));
   return{...base,merchant_prepare_id:t.provider_id,error:0,error_note:"Success"};
  }
  if(!t||String(p.merchant_prepare_id)!==t.provider_id)return fail(-6,"Transaction not found");
  if(Number(p.error)<0){await cancel(db,t,Number(p.error));return fail(-9,"Cancelled");}
  if(t.state===2)return{...base,merchant_confirm_id:t.provider_id,error:0,error_note:"Success"};
  if(t.state<0)return fail(-9,"Cancelled");
  t=await perform(db,t);return{...base,merchant_confirm_id:t.provider_id,error:0,error_note:"Success"};
 }catch(err){return fail(err.code===-31001?-2:err.code===-31050?-5:-9,"Payment could not be completed");}
}
