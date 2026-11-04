import { canSell } from "../../../lib/roles.js";
import { env } from "../../../lib/runtime-env.js";
import { getMongoDb } from "../../../lib/mongodb.js";
import { getAppUser, sameOrigin, phoneVerified } from "../../../lib/auth.js";
import { validImage, inspectImage } from "../../../lib/image-review.js";
export async function POST(req) {
  try {
    const u = await getAppUser();
    if (!u) return Response.json({ error: "Hisobga kiring" }, { status: 401 });
    const db=await getMongoDb();
    if (env.SMS_REQUIRED === "true" && !(await phoneVerified(db, u.userId)))
      return Response.json({ error: "Avval telefonni tasdiqlang" }, { status: 403 });
    if (!canSell(u.role)) return Response.json({ error: "Faqat sotuvchi uchun" }, { status: 403 });
    if((await db.collection('users').findOne({id:u.userId},{projection:{selling_paused:1}}))?.selling_paused)
      return Response.json({error:"Savdo vaqtincha cheklangan"},{status:403});
    if (!sameOrigin(req)) return new Response(null, { status: 403 });
    if (Number(req.headers.get("content-length")) > 2200000)
      return Response.json({ error: "Rasm 2 MB dan oshmasin" }, { status: 413 });
    const count=await db.collection('image_checks').countDocuments({owner:u.userId,created:{$gt:Date.now()-60000}});
    if(count>=6)return Response.json({error:"Bir daqiqada 6 tagacha rasm. Bir oz kuting."},{status:429});
    const f=(await req.formData()).get("file");
    if(!f||typeof f.arrayBuffer!=="function"||!["image/jpeg","image/png","image/webp"].includes(f.type)||f.size>2000000)
      return Response.json({error:"JPG, PNG yoki WebP; 2 MB gacha"},{status:400});
    const bytes=await f.arrayBuffer();
    if(!validImage(bytes,f.type))return Response.json({error:"Rasm fayli noto‘g‘ri. Haqiqiy JPG, PNG yoki WebP yuklang."},{status:400});
    const key=u.userId+"/"+crypto.randomUUID(),review=await inspectImage(bytes,f.type,env),now=Date.now();
    await db.collection('image_checks').insertOne({key,owner:u.userId,status:review.status,note:review.note,created:now});
    if(review.status==='rejected')return Response.json({error:review.note,review},{status:422});
    await db.collection('uploaded_files').updateOne({key},{$set:{key,content_type:f.type,body:Buffer.from(bytes),created:now}},{upsert:true});
    return Response.json({url:"/api/image?id="+key,review});
  } catch { return Response.json({ error: "Rasm yuklanmadi. Qayta urinib ko‘ring." }, { status: 500 }); }
}
export async function GET(req) {
  const key = new URL(req.url).searchParams.get("id");
  if (!key) return new Response(null, { status: 404 });
  let image;
  try {
    image = await env.BUCKET.get(key);
  } catch {
    return new Response(null, { status: 503 });
  }
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.body, {
    headers: {
      "Content-Type": image.httpMetadata.contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
