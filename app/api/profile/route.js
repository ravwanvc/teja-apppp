import { env } from "../../../lib/runtime-env.js";
import { getMongoDb } from "../../../lib/mongodb.js";
import { getAppUser, sameOrigin } from "../../../lib/auth.js";
export async function POST(req){
 if(!sameOrigin(req))return Response.json({error:'Origin'},{status:403});
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 if(Number(req.headers.get('content-length'))>2200000)return Response.json({error:'Rasm 2 MB dan kichik bo‘lsin'},{status:413});
 const f=await req.formData(),file=f.get('avatar');
 if(!file||typeof file.arrayBuffer!=='function'||file.size>2000000)return Response.json({error:'JPG, PNG yoki WebP, 2 MB gacha'},{status:400});
 const data=new Uint8Array(await file.arrayBuffer());
 const type=data[0]===255&&data[1]===216?'image/jpeg':data[0]===137&&data[1]===80&&data[2]===78?'image/png':String.fromCharCode(...data.slice(0,4))==='RIFF'&&String.fromCharCode(...data.slice(8,12))==='WEBP'?'image/webp':null;
 if(!type)return Response.json({error:'Faqat JPG, PNG yoki WebP'},{status:400});
 const key='avatars/'+u.userId+'/'+crypto.randomUUID();
 const db=await getMongoDb();
 const previous=await db.collection('users').findOne({id:u.userId},{projection:{avatar:1}});
 await env.BUCKET.put(key,data,{httpMetadata:{contentType:type}});
 const avatar='/api/profile?image='+encodeURIComponent(key);
 await db.collection('users').updateOne({id:u.userId},{$set:{avatar}});
 if(previous?.avatar?.startsWith('/api/profile?image=')){try{await env.BUCKET.delete(decodeURIComponent(previous.avatar.split('image=')[1]));}catch{}}
 return Response.json({ok:true,avatar});
}

export async function PATCH(req){
 if(!sameOrigin(req))return Response.json({error:'Origin'},{status:403});
 const u=await getAppUser();if(!u)return Response.json({error:'Hisobga kiring'},{status:401});
 try {
  const body=await req.json();
  const first=String(body.firstName||'').trim().replace(/\s+/g,' ');
  const last=String(body.lastName||'').trim().replace(/\s+/g,' ');
  if(first.length<2||first.length>60||last.length>60||/[<>]/.test(first+last))return Response.json({error:'Ism va familiyani to‘g‘ri kiriting'},{status:400});
  const name=[first,last].filter(Boolean).join(' ');
  await (await getMongoDb()).collection('users').updateOne({id:u.userId},{$set:{name}});
  return Response.json({ok:true,name});
 } catch { return Response.json({error:'Profilni saqlab bo‘lmadi'},{status:400}); }
}
export async function GET(req){const key=new URL(req.url).searchParams.get('image')||'';if(!/^avatars\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(key))return new Response('Not found',{status:404});const image=await env.BUCKET.get(key);if(!image)return new Response('Not found',{status:404});return new Response(image.body,{headers:{'Content-Type':image.httpMetadata.contentType,'X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=86400'}});}
