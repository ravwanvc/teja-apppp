import { getMongoDb } from '../../../lib/mongodb.js';
import { env } from '../../../lib/runtime-env.js';
import { getAppUser } from '../../../lib/auth.js';
export async function GET(req){
 if(!(await getAppUser()))return Response.json({error:'Hisobga kiring'},{status:401});
 const db=await getMongoDb(),q=new URL(req.url).searchParams,reverse=q.has('lat'),lat=Number(q.get('lat')),lng=Number(q.get('lng'));
 if(reverse&&(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180))return Response.json({error:'Koordinata xato'},{status:400});
 if(!reverse&&(!q.get('q')||q.get('q').length>150))return Response.json({error:'Manzilni yozing'},{status:400});
 const city=await db.collection('cities').findOne({name:q.get('city')||'Toshkent'});
 const params=reverse?`lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&limit=1`:`q=${encodeURIComponent(q.get('q'))}&limit=5&lat=${city?.lat||41.31}&lon=${city?.lng||69.28}`;
 const key=(reverse?'reverse?':'api?')+params,cache=await db.collection('geo').findOne({key,created:{$gt:Date.now()-7*86400000}});
 if(cache)return Response.json(cache.value);
 const now=Date.now(),slot='rate:'+Math.floor(now/1500);
 try{await db.collection('geo').insertOne({key:slot,value:{},created:now});}
 catch(e){if(e.code===11000)return Response.json({error:'Bir oz kutib qayta qidiring'},{status:429});throw e;}
 try{
  const base=env.GEOCODER_URL||'https://photon.komoot.io',r=await fetch(base+'/'+key,{headers:{'User-Agent':'TEJA-MVP/1.0'},signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error();const data=await r.json();
  await db.collection('geo').updateOne({key},{$set:{key,value:data,created:Date.now()}},{upsert:true});
  await db.collection('geo').deleteMany({created:{$lt:Date.now()-7*86400000}});
  return Response.json(data);
 }catch{return Response.json({error:'Xarita qidiruvi vaqtincha ishlamadi. Nuqtani belgilang va manzilni qo‘lda yozing.'},{status:502});}
}
