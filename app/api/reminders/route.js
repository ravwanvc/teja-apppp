import { getMongoDb } from '../../../lib/mongodb.js';
import { env } from '../../../lib/runtime-env.js';
import {getAppUser,sameOrigin,phoneVerified} from '../../../lib/auth.js';
import {remindersConfigured} from '../../../lib/reminder-sms.js';
export async function GET(){
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 const db=await getMongoDb(),pref=await db.collection('reminder_preferences').findOne({owner:u.userId});
 const deliveries=u.role==='admin'?await db.collection('reminder_deliveries').find().sort({created:-1}).limit(100).toArray():[];
 return Response.json({enabled:!!pref?.sms,configured:remindersConfigured(env),deliveries},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req){
 if(!sameOrigin(req))return Response.json({error:'Origin'},{status:403});
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 const b=await req.json();if(typeof b.enabled!=='boolean')return Response.json({error:'Qiymat noto‘g‘ri'},{status:400});
 const db=await getMongoDb();if(b.enabled&&!(await phoneVerified(db,u.userId)))return Response.json({error:'Avval telefoningizni tasdiqlang'},{status:400});
 await db.collection('reminder_preferences').updateOne({owner:u.userId},{$set:{sms:b.enabled?1:0,updated:Date.now()}},{upsert:true});
 return Response.json({ok:true});
}
