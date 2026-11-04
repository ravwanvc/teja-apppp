import { canSell } from "../../../lib/roles.js";
import { getMongoDb } from "../../../lib/mongodb.js";
import { getAppUser, sameOrigin, throttle } from "../../../lib/auth.js";
import { emptyListing } from "../../../lib/listing-tools.js";
const reply=(v,s=200)=>Response.json(v,{status:s,headers:{"Cache-Control":"no-store"}});
export async function GET(){
 const u=await getAppUser();if(!u)return reply({error:"Hisobga kiring"},401);
 if(!canSell(u.role))return reply({error:"Faqat sotuvchi uchun"},403);
 const docs=await (await getMongoDb()).collection('listing_drafts').find({owner:u.userId},{projection:{_id:0,id:1,body:1,version:1,updated:1}}).sort({updated:-1}).limit(30).toArray();
 return reply({drafts:docs.map(d=>({...d,body:typeof d.body==='string'?JSON.parse(d.body):d.body}))});
}
export async function POST(req){
 if(!sameOrigin(req))return reply({error:"Ruxsat yo‘q"},403);
 const u=await getAppUser();if(!u)return reply({error:"Hisobga kiring"},401);
 if(!canSell(u.role))return reply({error:"Faqat sotuvchi uchun"},403);
 const db=await getMongoDb(),user=await db.collection('users').findOne({id:u.userId},{projection:{selling_paused:1}});
 if(user?.selling_paused)return reply({error:"Savdo vaqtincha cheklangan"},403);
 try{
  const raw=await req.text();if(raw.length>12000)return reply({error:"Qoralama juda katta"},413);
  const b=JSON.parse(raw);if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.id||""))return reply({error:"Qoralama raqami noto‘g‘ri"},400);
  if(!(await throttle(db,"draft:"+u.userId,60,60000)))return reply({error:"Bir oz kuting"},429);
  const collection=db.collection('listing_drafts'),prior=await collection.findOne({id:b.id});
  if(prior&&prior.owner!==u.userId)return reply({error:"Ruxsat yo‘q"},403);
  if(prior&&prior.version!==b.version)return reply({error:"Qoralama boshqa oynada o‘zgargan. Ro‘yxatni yangilang va qayta oching."},409);
  if(b.action==="delete"){
   if(prior){const r=await collection.deleteOne({id:b.id,owner:u.userId,version:b.version});if(!r.deletedCount)return reply({error:"Qoralama yangilangan. Qayta oching."},409);}
   return reply({ok:true});
  }
  if(b.action!=="save"||!b.body||typeof b.body!=="object")return reply({error:"So‘rov noto‘g‘ri"},400);
  const body={};
  for(const k of Object.keys(emptyListing())){
   const v=b.body[k];
   if(k==="images"){if(Array.isArray(v)&&v.length<=3&&v.every(url=>typeof url==="string"&&url.startsWith("/api/image?id="+u.userId+"/")))body[k]=v;}
   else if(["lat","lng"].includes(k)){if(v===null||(typeof v==="number"&&Number.isFinite(v)))body[k]=v;}
   else if(["price","original","stock"].includes(k)){if((typeof v==="number"&&Number.isFinite(v))||(typeof v==="string"&&v.length<20))body[k]=v;}
   else if(typeof v==="string"&&v.length<=1000)body[k]=v;
  }
  if(body.image&&!body.image.startsWith("/api/image?id="+u.userId+"/"))return reply({error:"Rasm hisobingizga tegishli emas"},400);
  const now=Date.now();
  if(prior){
   const changed=await collection.updateOne({id:b.id,owner:u.userId,version:b.version},{$set:{body,updated:now},$inc:{version:1}});
   if(!changed.modifiedCount)return reply({error:"Qoralama yangilangan. Qayta oching."},409);
  }else{
   if(await db.collection('products').findOne({id:b.id},{projection:{_id:1}}))return reply({error:"Mahsulot allaqachon joylangan. Yangi partiya yarating."},409);
   if(b.version!==0)return reply({error:"Qoralama o‘chirilgan yoki nashr qilingan. Yangisini yarating."},409);
   if(await collection.countDocuments({owner:u.userId})>=30)return reply({error:"30 ta qoralama bor. Keraksizini o‘chiring."},400);
   await collection.insertOne({id:b.id,owner:u.userId,body,version:1,updated:now});
  }
  return reply({ok:true,version:(prior?.version||0)+1});
 }catch{return reply({error:"Qoralama saqlanmadi. Qayta urinib ko‘ring."},400);}
}
