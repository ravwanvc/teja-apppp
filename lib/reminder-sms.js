import { getMongoDb } from "./mongodb.js";
export const remindersConfigured=env=>env.REMINDER_SMS_READY==='true'&&env.SMS_MODE==='live'&&!!(env.TWILIO_ACCOUNT_SID&&env.TWILIO_AUTH_TOKEN&&env.TWILIO_MESSAGING_SERVICE_SID);
// Ambiguous provider timeouts are recorded, not retried, to prevent duplicate reminders.
export async function sendPickupSms(env,now=Date.now()){
 if(!remindersConfigured(env))return{submitted:0,configured:false};
 const db=await getMongoDb(),orders=await db.collection("orders").aggregate([
  {$match:{is_mock:0,status:"reserved",pickup_at:{$gt:now,$lte:now+900000}}},
  {$lookup:{from:"app_accounts",localField:"buyer",foreignField:"owner",as:"account"}},
  {$lookup:{from:"reminder_preferences",localField:"buyer",foreignField:"owner",as:"preference"}},
  {$match:{"account.phone_verified":{$in:[1,true]},"preference.sms":{$in:[1,true]}}},
  {$project:{_id:0,id:1,buyer:1,pickup_at:1,phone:{$arrayElemAt:["$account.phone",0]}}},
  {$limit:25}
 ]).toArray();
 let submitted=0;
 for(const o of orders){
  try{await db.collection("reminder_deliveries").insertOne({order_id:o.id,state:"submitting",created:now,updated:now});}
  catch(error){if(error?.code===11000)continue;throw error;}
  try{
   const when=new Date(o.pickup_at).toLocaleTimeString('uz-UZ',{timeZone:'Asia/Tashkent',hour:'2-digit',minute:'2-digit'});
   const r=await fetch('https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(env.TWILIO_ACCOUNT_SID)+'/Messages.json',{method:'POST',headers:{Authorization:'Basic '+btoa(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:o.phone,MessagingServiceSid:env.TWILIO_MESSAGING_SERVICE_SID,Body:'TEJA: buyurtmangizni '+when+' gacha olib keting. Ulgurmasangiz Hisobim > Buyurtmalar bo‘limida bekor qiling.'}),signal:AbortSignal.timeout(10000)});
   const payload=await r.json();
   if(!r.ok||!payload.sid){await db.collection("reminder_deliveries").updateOne({order_id:o.id},{$set:{state:"failed",error:'HTTP '+r.status,updated:now}});continue;}
   await db.collection("reminder_deliveries").updateOne({order_id:o.id},{$set:{state:"submitted",provider_id:payload.sid,updated:now}});submitted++;
  }catch{await db.collection("reminder_deliveries").updateOne({order_id:o.id},{$set:{state:"unknown",error:'Tasdiq olinmadi; provayder jurnalini tekshiring',updated:now}});}
 }
 return{submitted,configured:true};
}
