import { getMongoDb } from '../../../lib/mongodb.js';
import { getAppUser } from '../../../lib/auth.js';
export async function GET(){
 const u=await getAppUser();if(!u)return new Response('Hisobga kiring',{status:401});
 if(!['seller','admin'].includes(u.role))return new Response('Faqat sotuvchi uchun',{status:403});
 const db=await getMongoDb(),me=await db.collection('users').findOne({id:u.userId},{projection:{role:1}});
 const match={status:'collected',provider:{$ne:'demo'},is_mock:{$ne:1}};
 if(me?.role!=='admin'){
  const products=await db.collection('products').find({owner:u.userId},{projection:{id:1}}).toArray();
  match.product={$in:products.map(p=>p.id)};
 }
 const rows=await db.collection('orders').aggregate([{$match:match},{$sort:{created:-1}},{$limit:10000},{$lookup:{from:'products',localField:'product',foreignField:'id',as:'_product'}},{$unwind:'$_product'},{$project:{_id:0,order:'$$ROOT',title:'$_product.title',shop:'$_product.shop'}}]).toArray();
 const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
 const content=[['Chek','Sana (Toshkent)','Do‘kon','Mahsulot','Miqdor','Bir dona UZS','Jami UZS','TEJA komissiya UZS','Sotuvchi ulushi UZS'],...rows.map(({order:o,title,shop})=>{
  const p=typeof o.snapshot==='string'?JSON.parse(o.snapshot||'{}'):(o.snapshot||{}),items=Array.isArray(o.cart_items)?o.cart_items:JSON.parse(o.cart_items||'[]'),qty=items.reduce((n,i)=>n+Number(i.qty),0)||o.qty,fee=o.provider==='cash'&&o.payment_state!=='refunded'?o.commission_due:o.payment_state==='paid'?o.deposit:0;
  return[o.receipt_no||o.id,new Date(o.created).toLocaleString('uz-UZ',{timeZone:'Asia/Tashkent'}),p.shop||shop,p.title||title,qty,items.length>1?'Savat jami':(items[0]?.price??o.price),o.price*o.qty,fee,o.price*o.qty-fee];
 })].map(row=>row.map(cell).join(',')).join('\r\n');
 return new Response('\uFEFF'+content,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="teja-savdo-hisoboti.csv"','Cache-Control':'no-store'}});
}
