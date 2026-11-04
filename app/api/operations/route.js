import { getMongoDb } from '../../../lib/mongodb.js';
import {getAppUser} from '../../../lib/auth.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export async function GET(req){
 const me=await getAppUser();if(!me)return json({error:'Hisobga kiring'},401);
 if(!['admin','seller'].includes(me.role))return json({error:'Ruxsat yo‘q'},403);
 const db=await getMongoDb(),q=new URL(req.url).searchParams,page=Math.max(1,Math.min(100000,parseInt(q.get('page'),10)||1)),size=25,kind=q.get('kind')||'activity';
 try{
  if(kind==='users'){
   if(me.role!=='admin')return json({error:'Faqat admin'},403);
   const search=String(q.get('q')||'').slice(0,100),role=['member','seller','admin'].includes(q.get('role'))?q.get('role'):'';
   const filter={role:{$ne:'deleted'},$and:[{$or:[{name:{$regex:escRe(search),$options:'i'}},{business_name:{$regex:escRe(search),$options:'i'}}]}]};
   if(role)filter.$and.push({role});
   const total=await db.collection('users').countDocuments(filter);
   const users=await db.collection('users').aggregate([{$match:filter},{$sort:{created:-1,id:1}},{$skip:(page-1)*size},{$limit:size},{$lookup:{from:'products',localField:'id',foreignField:'owner',as:'_products'}},{$lookup:{from:'orders',localField:'id',foreignField:'buyer',as:'_orders'}},{$project:{_id:0,id:1,name:1,role:1,created:1,verified:1,verification:1,business_name:1,products:{$size:'$_products'},purchases:{$size:'$_orders'}}}]).toArray();
   return json({users,page,pages:Math.max(1,Math.ceil(total/size)),total});
  }
  if(kind!=='activity')return json({error:'Noto‘g‘ri bo‘lim'},400);
  const events=await db.collection('stock_events').aggregate([{$lookup:{from:'products',localField:'product',foreignField:'id',as:'_product'}},{$unwind:'$_product'},{$match:me.role==='admin'?{}:{'_product.owner':me.userId}},{$sort:{created:-1}},{$limit:100},{$lookup:{from:'users',localField:'actor',foreignField:'id',as:'_actor'}},{$unwind:'$_actor'},{$project:{_id:0,id:1,qty:1,created:1,title:'$_product.title',shop:'$_product.shop',actor:'$_actor.name'}}]).toArray();
  return json({events});
 }catch{return json({error:'Ma’lumot yuklanmadi. Qayta urinib ko‘ring.'},500);}
}
