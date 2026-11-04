import { env } from "../../../lib/runtime-env.js";
import { currentUser } from "../../../lib/auth.js";
export async function GET(){
 if((await currentUser())?.role!=="admin")return Response.json({error:"Ruxsat yo‘q"},{status:403});
 return Response.json({modes:{payments:"mock",sms:"off"},services:[
 {name:"Click / Payme sinov to‘lovi",configured:true,keys:[],note:"Tasdiqlash oynasi va chek ishlaydi. Haqiqiy pul yechilmaydi. API kaliti kerak emas."},
 {name:"Hisobga kirish",configured:!!(env.ADMIN_PHONE&&env.ADMIN_PASSWORD_HASH),keys:[],note:"Telefon va parol. SMS va 2FA talab qilinmaydi. Xaridor paroli maxfiy tiklash kaliti bilan tiklanadi."},
 {name:"Google Maps",configured:true,keys:[],note:"Oddiy xarita kalitsiz ochiladi. Narxli belgilar uchun Google Maps kaliti ixtiyoriy."},
 {name:"Rasm tahlili",configured:!!(env.GEMINI_API_KEY&&env.GEMINI_MODEL),keys:[],note:"API ulangan bo‘lsa avtomatik tekshiruv. Aks holda admin rasmni qo‘lda tasdiqlaydi."}
 ]},{headers:{"Cache-Control":"no-store"}});
}
