import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import Home from '../app/market-client.jsx';
import AuthForm from '../app/auth-form.jsx';
import PaymentConfirm from '../app/payment-confirm.jsx';
import {LanguageProvider} from '../app/language.jsx';
import {panelMetrics} from '../lib/panel-metrics.js';
import {assets,seedProducts} from './seed.js';
const users={member:{id:'preview-buyer',name:'Jasurbek Ibrohimjonov',role:'member',avatar:'',verified:1},seller:{id:'preview-seller',name:'Zarina Karimova',role:'seller',business_name:'Bon! Bakery',verified:1,verification:'approved',business_contact:'+998 90 000 00 01'},admin:{id:'preview-admin',name:'TEJA Administrator',role:'admin'}};
const uuid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
let role='member',db={products:seedProducts,orders:[],favorites:[],notifications:[{id:'hello',kind:'new_offer',entity:'preview-p1',created:Date.now()}],follows:[],waiting:[],claims:[],cards:[],drafts:[],events:[],reviews:[],reports:[{id:'report-preview',kind:'product',target:'preview-p1',reason:'Olib ketish manzilini aniqlashtirish kerak',status:'pending'}],sellers:[users.seller,{id:'preview-pending-seller',name:'Aziza Sobirova',role:'seller',business_name:'Mahalla Market',business_contact:'+998 90 000 00 02',verified:0,verification:'pending',created:Date.now()}]};
db.orders=['reserved','collected','cancelled'].map((status,i)=>{const p=seedProducts[i];return {...p,id:'sample-order-'+(i+1),buyer:users.member.id,items:[{...p,qty:1}],qty:1,created:Date.now()-(i+1)*86400000,pickup_at:p.until,pickup_selected:1,status,code:['A7B93E12','B17D2323','F099123C'][i],receipt_no:970+i,deposit:Math.ceil(p.price/10),payment_state:status==='cancelled'?'refunded':'test',provider:'payme',is_mock:1};});
db.partners=[{id:'partner-bon',owner:users.seller.id,name:'Bon! Bakery',contact:'+998 90 000 00 01',address:'Toshkent, Amir Temur ko‘chasi',rate_bps:1000,enabled:1,created:Date.now(),updated:Date.now()}];
db.ledger=[];db.audit=[];db.reminders=false;
db.products=db.products.map(p=>({...p,prepared_at:Date.now()-3600000,best_before:p.until+3600000}));
db.orders.slice(0,2).forEach(o=>{o.provider='cash';o.deposit=0;o.partner_id='partner-bon';o.commission_rate=1000;o.commission_due=Math.ceil(o.price/10);o.payment_state=o.status==='collected'?'cash_paid':'cash_due';if(o.status==='collected')db.ledger.push({id:'sale-'+o.id,partner_id:'partner-bon',kind:'commission',amount:o.commission_due,order_id:o.id,actor_name:users.seller.name,created:o.created});});
try{const stored=JSON.parse(localStorage.getItem('teja-preview-v3-db'));if(stored){db={...db,...stored,products:stored.products||seedProducts};}}catch{}
const persist=()=>{try{localStorage.setItem('teja-preview-v3-db',JSON.stringify(db));}catch{throw Error('Preview xotirasi to‘ldi. Kichikroq rasm tanlang yoki demo ma’lumotlarini tozalang.');}};
const response=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
const read=body=>body?JSON.parse(body):{};

window.previewNavigate=path=>{window.dispatchEvent(new CustomEvent('preview-route',{detail:path}));};
window.fetch=async(input,opts={})=>{
 const u=new URL(String(input),'https://preview.teja.local'),path=u.pathname,b=opts.body instanceof FormData?{}:read(opts.body),me=users[role];
 db.orders.filter(o=>o.status==='pending_payment'&&o.hold_until<=Date.now()).forEach(o=>{o.status='expired';o.items.forEach(i=>{const product=db.products.find(p=>p.id===i.id);if(product)product.stock+=i.qty;});persist();});
 if(path==='/api/reminders'){if(opts.method){db.reminders=!!b.enabled;persist();return response({ok:true});}return response({enabled:db.reminders,configured:false,deliveries:[]});}
 if(path==='/api/partners'){
  if(u.searchParams.has('owner'))return response({cash:db.partners.some(p=>p.owner===u.searchParams.get('owner')&&p.enabled&&!db.sellers.find(s=>s.id===p.owner)?.selling_paused)});
  if(!['admin','seller'].includes(role))return response({error:'Ruxsat yo‘q'},403);
  const sum=(id,kind)=>db.ledger.filter(l=>l.partner_id===id&&(!kind||l.kind===kind)).reduce((n,l)=>n+l.amount,0);
  if(!opts.method){const businesses=db.partners.filter(p=>role==='admin'||p.owner===me.id).map(p=>({...p,seller:db.sellers.find(s=>s.id===p.owner)?.name,balance:sum(p.id),accrued:sum(p.id,'commission'),settled:-sum(p.id,'settlement'),reversed:-sum(p.id,'refund')}));const id=u.searchParams.get('id');return response({businesses,sellers:db.sellers,ledger:db.ledger.filter(l=>l.partner_id===id),orders:db.orders.filter(o=>o.partner_id===id),events:db.audit});}
  if(role!=='admin')return response({error:'Faqat admin'},403);
  if(b.action==='save'){if(!b.name||!b.contact||!b.address)return response({error:'Maydonlarni to‘ldiring'},400);if(b.owner&&db.partners.some(p=>p.owner===b.owner&&p.id!==b.id))return response({error:'Bu sotuvchi hamkorga biriktirilgan'},400);const old=db.partners.find(p=>p.id===b.id);const value={...b,id:b.id||uuid(),enabled:b.enabled?1:0,created:old?.created||Date.now(),updated:Date.now()};if(old)Object.assign(old,value);else db.partners.unshift(value);db.audit.unshift({id:uuid(),action:'partner_save',actor_name:me.name,target:value.id,created:Date.now()});}
  else if(b.action==='settle'){if(db.ledger.some(l=>l.id===b.requestId))return response({ok:true});if(!b.confirmed||!b.reference||b.amount<=0||b.amount>sum(b.id))return response({error:'Summa va tasdiqni tekshiring'},400);db.ledger.unshift({id:b.requestId,partner_id:b.id,kind:'settlement',amount:-b.amount,reference:b.reference,actor_name:me.name,created:Date.now()});}
  else if(b.action==='restrict'){const seller=db.sellers.find(s=>s.id===b.id);seller.selling_paused=b.paused?1:0;if(b.id===users.seller.id)users.seller.selling_paused=seller.selling_paused;if(b.paused)db.products.filter(p=>p.owner===b.id).forEach(p=>p.active=0);db.audit.unshift({id:uuid(),action:b.paused?'seller_pause':'seller_resume',actor_name:me.name,target:b.id,note:b.reason,created:Date.now()});}
  else return response({error:'Amal topilmadi'},400);persist();return response({ok:true});
 }
 if(path==='/api/maps')return response({key:''});
 if(path==='/api/changes')return response({changed:true,version:Date.now()});
 if(path==='/api/auth'){
  if(!opts.method)return response({user:me,smsRequired:false,mockSms:false});
  if(b.action==='logout'){role='guest';return response({ok:true});}
  if(b.action==='reset'&&(b.password!==b.confirmPassword||!String(b.recoveryCode||'').startsWith('TEJA-')))return response({error:'Tiklash kaliti va parollarni tekshiring'},400);
  if(b.action==='register'){role=b.role;users[role]={...users[role],name:b.name};}
  else if(role==='guest')role='member';
  return response({ok:true,redirect:role==='seller'?'/?view=seller':'/'});
 }
 if(path==='/api/phone')return response({error:'SMS o‘chirilgan'},410);
 if(path==='/api/profile'&&opts.method){const file=opts.body.get('avatar');if(!file||file.size>2000000)return response({error:'2 MB gacha rasm tanlang'},400);const avatar=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});users[role].avatar=avatar;return response({ok:true,avatar});}
 if(path==='/api/payments')return response({payme:true,click:true,card:true,mock:true,demo:true});
 if(path==='/api/cards'){
 if(opts.method){if(b.action==='remove')db.cards=db.cards.filter(c=>c.id!==b.id);else if(b.action==='add')db.cards.push({id:uuid(),brand:b.brand,last4:b.last4,expiry:b.expiry,number:'•••• •••• •••• '+b.last4});persist();return response({ok:true});}
 return response({cards:db.cards,demo:true,configured:true});}
 if(path==='/api/payments/mock'){
 const o=db.orders.find(o=>o.id===(opts.method?b.id:u.searchParams.get('id'))&&o.buyer===me?.id);
 if(!o)return response({error:'Buyurtma topilmadi'},404);
 if(!opts.method)return response({order:{...o,total:o.price*o.qty,method:o.mock_method||o.provider}});
 if(o.payment_state==='test'&&b.outcome==='pay')return response({ok:true,id:o.id});
 if(o.status!=='pending_payment'||o.hold_until<=Date.now())return response({error:'To‘lov muddati tugagan'},400);
 if(b.outcome==='pay'){o.status='reserved';o.payment_state='test';o.paid_at=Date.now();o.receipt_no=1001+db.orders.filter(x=>x.receipt_no).length;db.notifications.unshift({id:uuid(),kind:'paid',entity:o.id,created:Date.now()});}
 else{o.status='cancelled';o.items.forEach(i=>{db.products.find(p=>p.id===i.id).stock+=i.qty;});}
 persist();return response({ok:true,id:o.id});
 }
 if(path==='/api/security')return response({ok:true,recoveryCode:'TEJA-'+uuid()+uuid().slice(0,16)});
 if(path==='/api/image' && opts.method){
  if(role!=='seller')return response({error:'Faqat sotuvchi'},403);
  const file=opts.body.get('file');if(!file||file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type))return response({error:'Preview uchun JPG, PNG yoki WebP; 2 MB gacha'},400);
  const url=await new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(file);});return response({url,review:{status:'review',note:'Preview — admin tekshiruvini sinab ko‘ring.'}});
 }
 if(path==='/api/drafts'){
  if(role!=='seller')return response({error:'Faqat sotuvchi'},403);
  if(!opts.method)return response({drafts:db.drafts});
  const prior=db.drafts.find(x=>x.id===b.id);if(prior&&prior.version!==b.version)return response({error:'Qoralama o‘zgargan'},409);
  db.drafts=db.drafts.filter(x=>x.id!==b.id);if(b.action==='save')db.drafts.push({id:b.id,body:b.body,version:(prior?.version||0)+1,updated:Date.now()});persist();return response({ok:true,version:(prior?.version||0)+1});
 }
 if(path==='/api/services')return response({modes:{payments:'mock',sms:'off'},services:[{name:'Click / Payme sinov to‘lovi',configured:true,keys:[],note:'API kaliti kerak emas. Pul yechilmaydi.'},{name:'Google Maps',configured:true,keys:[],note:'Internet orqali ishlaydi.'}]});
 if(path==='/api/reports'){if(opts.method){const r=db.reports.find(r=>r.id===b.id);if(r)r.status='resolved';persist();return response({ok:true});}return response({reports:db.reports});}
 if(path==='/api/refunds'){if(role!=='admin')return response({error:'Faqat admin'},403);if(opts.method){const o=db.orders.find(o=>o.id===b.id);if(!o||!o.payment_state.includes('refund_due'))return response({error:'Qaytarish topilmadi'},400);if(o.provider==='cash'&&(!b.confirmed||!b.reference))return response({error:'Qaytarish hujjati va tasdiq kerak'},400);o.payment_state='refunded';o.reference=b.reference;if(o.provider==='cash'&&!db.ledger.some(l=>l.id==='refund-'+o.id))db.ledger.unshift({id:'refund-'+o.id,partner_id:o.partner_id,kind:'refund',amount:-o.commission_due,order_id:o.id,reference:b.reference,actor_name:me.name,created:Date.now()});persist();return response({ok:true});}return response({orders:db.orders.filter(o=>['refund_due','cash_refund_due','refunded'].includes(o.payment_state))});}
 if(path==='/api/operations'){
  if(!['admin','seller'].includes(role))return response({error:'Ruxsat yo‘q'},403);
  if(u.searchParams.get('kind')==='users'){
   if(role!=='admin')return response({error:'Faqat admin'},403);
   const all=[users.member,users.admin,...db.sellers].map(x=>({...x,created:x.created||Date.now()-86400000,products:db.products.filter(p=>p.owner===x.id).length,purchases:db.orders.filter(o=>o.buyer===x.id).length}));
   const filtered=all.filter(x=>(!u.searchParams.get('role')||x.role===u.searchParams.get('role'))&&((x.name+' '+(x.business_name||'')).toLowerCase().includes((u.searchParams.get('q')||'').toLowerCase())));
   return response({users:filtered,page:1,pages:1,total:filtered.length});
  }return response({events:db.events});
 }
 if(path==='/api/notifications'){
  if(opts.method){db.notifications=db.notifications.map(n=>b.all||b.id===n.id?{...n,read_at:Date.now()}:n);persist();return response({ok:true});}
  return response({notifications:db.notifications});
 }
 if(path==='/api/community'){
  if(!opts.method)return response({follows:db.follows,waiting:db.waiting,claims:db.claims});
  if(b.action==='follow'){db.follows=db.follows.filter(f=>f.seller!==b.seller);if(b.enabled)db.follows.push({seller:b.seller,hour:b.hour});}
  if(b.action==='wait')db.waiting.push({product:b.id});
  if(b.action==='claim')db.claims.push({id:uuid(),order_id:b.id,reason:b.reason,status:'pending'});
  if(b.action==='resolve'){const c=db.claims.find(c=>c.id===b.id);if(c){c.status=b.status;c.reply=b.reply;const o=db.orders.find(o=>o.id===c.order_id);if(o&&b.status==='approved'&&['test','cash_paid'].includes(o.payment_state))o.payment_state=o.provider==='cash'?'cash_refund_due':'refund_due';}}
  persist();return response({ok:true});
 }
 if(path==='/api/data'){
  if(!opts.method){let products=db.products.filter(p=>(!u.searchParams.get('category')||p.category===u.searchParams.get('category'))&&(!u.searchParams.get('q')||(p.title+' '+p.shop).toLowerCase().includes(u.searchParams.get('q').toLowerCase())));return response({demo:true,me,products,orders:db.orders.filter(o=>role==='admin'||o.buyer===me?.id||o.owner===me?.id).map(o=>({...o,code:o.buyer===me?.id?o.code:undefined})),favorites:db.favorites,reviews:db.reviews,sellers:db.sellers,report:{orders_count:0,units:0,revenue:0,commission:0},pagination:{page:1,pages:1,total:products.length}});}
  if(!me)return response({error:'Avval hisobga kiring'},401);
  if(db.sellers.find(s=>s.id===me.id)?.selling_paused&&['create','quickDay','restock','toggle','editProduct','replaceImage'].includes(b.action))return response({error:'Yangi savdo vaqtincha cheklangan'},403);
  if(b.action==='reorderPreview'){const o=db.orders.find(o=>o.id===b.id&&o.buyer===me.id);if(!o)return response({error:'Buyurtma topilmadi'},404);const items=[],changes=[];o.items.forEach(i=>{const p=db.products.find(p=>p.id===i.id);if(!p?.active||p.stock<1){changes.push(i.title+': hozir mavjud emas');return;}items.push({...p,qty:Math.min(i.qty,p.stock)});if(p.price!==i.price||i.qty>p.stock)changes.push(i.title+': narx yoki miqdor yangilandi');});return response({items,changes});}
  if(b.action==='create'){
   if(role!=='seller')return response({error:'Faqat sotuvchi'},403);
   if(!b.product?.title||!b.product?.image)return response({error:'Mahsulot va rasmni kiriting'},400);
   if(!db.products.some(p=>p.id===b.requestId))db.products.unshift({...b.product,id:b.requestId,owner:me.id,created:Date.now(),active:0,image_status:'review',seller_verified:1,rating:0,review_count:0});
   db.drafts=db.drafts.filter(x=>x.id!==b.requestId);persist();return response({ok:true,id:b.requestId,message:'Mahsulot admin tekshiruviga yuborildi.'});
  }else if(b.action==='reviewImage'){const p=db.products.find(p=>p.id===b.id);p.image_status=b.approved?'approved':'rejected';p.active=b.approved?1:0;}
  else if(b.action==='verifySeller'){const s=db.sellers.find(s=>s.id===b.id);if(s){s.verified=b.approved?1:0;s.verification=b.approved?'approved':'rejected';}}
  else if(b.action==='requestVerification'){Object.assign(users.seller,{business_name:b.name,business_contact:b.contact,verification:'pending'});Object.assign(db.sellers.find(s=>s.id===me.id),users.seller);}
  else if(b.action==='replaceImage'){Object.assign(db.products.find(p=>p.id===b.id),{image:b.image,image_status:'review',active:0});}
  else if(b.action==='review'){db.reviews.push({order_id:b.id,rating:b.rating,comment:b.comment,created:Date.now()});}
  else if(b.action==='favorite'){db.favorites=db.favorites.includes(b.id)?db.favorites.filter(x=>x!==b.id):[...db.favorites,b.id];}
  else if(b.action==='checkout'){
   const previous=db.orders.find(o=>o.id===b.requestId);if(previous)return response(previous.status==='pending_payment'?{ok:true,id:previous.id,redirect:'/mock-payment?id='+previous.id}:{ok:true,id:previous.id,receiptReady:true});
   const items=(b.items||[{id:b.id,qty:b.qty}]).map(i=>({...db.products.find(p=>p.id===i.id),qty:i.qty}));
   if(items.some(p=>!p.active||p.stock<p.qty||db.sellers.find(s=>s.id===p.owner)?.selling_paused))return response({error:'Qoldiq yetarli emas'},400);
   if(new Set(items.map(p=>p.owner)).size>1)return response({error:'Bitta do‘kondan tanlang'},400);
   const cash=b.provider==='cash',partner=db.partners.find(p=>p.owner===items[0]?.owner&&p.enabled);if(cash&&!partner)return response({error:'Naqd to‘lov yoqilmagan'},400);
   const total=items.reduce((s,p)=>s+p.qty*p.price,0),now=Date.now(),id=b.requestId||uuid();
   db.orders.unshift({...items[0],id,buyer:users.member.id,items,title:items.map(p=>p.title).join(', '),price:total,qty:1,stock:1,status:cash?'reserved':'pending_payment',hold_until:now+300000,mock_method:b.provider,code:uuid().slice(0,8).toUpperCase(),created:now,pickup_at:Math.min(now+1800000,...items.map(p=>p.until)),pickup_selected:0,receipt_no:cash?1001+db.orders.length:null,deposit:cash?0:Math.ceil(total/10),payment_state:cash?'cash_due':'unpaid',provider:cash?'cash':b.provider,partner_id:cash?partner.id:null,commission_rate:cash?partner.rate_bps:0,commission_due:cash?Math.ceil(total*partner.rate_bps/10000):0,is_mock:1});
   items.forEach(p=>{db.products.find(x=>x.id===p.id).stock-=p.qty;});db.notifications.unshift({id:uuid(),kind:'paid',entity:id,created:now});persist();return response(cash?{ok:true,id,receiptReady:true}:{ok:true,id,redirect:'/mock-payment?id='+id});
  }else if(b.action==='cancel'||b.action==='collect'){
   const o=db.orders.find(o=>o.id===b.id);if(!o)return response({error:'Buyurtma topilmadi'},404);
   if(o.status!=='reserved')return response({error:'Buyurtma allaqachon yakunlangan'},400);
   if(b.action==='collect'&&b.code?.toUpperCase()!==o.code)return response({error:'Kod noto‘g‘ri'},400);
   if(b.action==='collect'&&o.provider==='cash'){if(!b.cashReceived)return response({error:'To‘liq naqd summani qabul qilganingizni tasdiqlang'},400);o.payment_state='cash_paid';o.paid_at=Date.now();db.ledger.unshift({id:'sale-'+o.id,partner_id:o.partner_id,kind:'commission',amount:o.commission_due,order_id:o.id,actor_name:me.name,created:Date.now()});}
   if(b.action==='cancel'&&o.status==='reserved'){o.items.forEach(i=>{db.products.find(p=>p.id===i.id).stock+=i.qty;});o.payment_state=o.provider==='cash'?'cash_due':'refunded';}
   o.status=b.action==='cancel'?'cancelled':'collected';
  }else if(b.action==='quickDay'){if(db.events.some(e=>e.id===b.requestId))return response({ok:true});const p=db.products.find(p=>p.id===b.id);p.stock+=Number(b.qty);p.price=b.price;p.until=b.until;p.prepared_at=b.prepared_at;p.best_before=b.best_before;p.active=1;db.events.unshift({id:b.requestId,title:p.title,shop:p.shop,actor:me.name,qty:Number(b.qty),created:Date.now()});}else if(b.action==='restock'){const p=db.products.find(p=>p.id===b.id);p.stock+=Number(b.qty);db.events.unshift({id:b.requestId,title:p.title,shop:p.shop,actor:me.name,qty:Number(b.qty),created:Date.now()});}
  else if(b.action==='toggle'){const p=db.products.find(p=>p.id===b.id);p.active=p.active?0:1;}
  else if(b.action==='editProduct'){Object.assign(db.products.find(p=>p.id===b.id),b.product);}
  else if(b.action==='schedule'){Object.assign(db.orders.find(o=>o.id===b.id),{pickup_at:b.pickupAt,pickup_selected:1});}
  else return response({error:'Bu amal uchun ZIPdagi serverli loyihani ishga tushiring.'},400);
  persist();return response({ok:true});
 }
 return response({error:'Bu funksiya serverli loyihada ishlaydi. ZIP ichidagi yo‘riqnomani oching.'},400);
};
function meId(){return users[role]?.id;}
function receipt(id){const o=db.orders.find(o=>o.id===id);if(!o)return;const box=document.createElement('div');box.className='overlay';const card=document.createElement('div');card.className='modal';const title=document.createElement('h2');title.textContent='TEJA · Chek №'+o.receipt_no;card.append(title);const notice=document.createElement('p');notice.textContent='SINOV — haqiqiy pul olinmagan. Fiskal chek emas.';card.append(notice);o.items.forEach(i=>{const p=document.createElement('p');p.textContent=i.title+' × '+i.qty+' — '+(i.price*i.qty).toLocaleString()+' so‘m';card.append(p);});const payment=document.createElement('p');payment.textContent=o.provider==='cash'?(o.payment_state==='cash_due'?'To‘liq naqd to‘lov do‘konda kutilmoqda':o.payment_state==='cash_paid'?'Naqd qabul qilish namoyishda qayd etildi':o.payment_state==='refunded'?'Qaytarish qayd etildi':'Qaytarish kutilmoqda'):'Namoyish to‘lovi';card.append(payment);const sum=document.createElement('h3');sum.textContent='Jami: '+o.price.toLocaleString()+' so‘m';card.append(sum);const code=document.createElement('p');code.textContent=o.buyer===meId()?'Topshirish kodi: '+o.code:'Xaridor QR-kodi bilan topshirishni tasdiqlang.';card.append(code);const close=document.createElement('button');close.textContent='Yopish';close.onclick=()=>box.remove();card.append(close);box.append(card);document.body.append(box);}
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const href=a.getAttribute('href');if(!href?.startsWith('/'))return;e.preventDefault();e.stopPropagation();if(href.startsWith('/api/report')){const blob=new Blob(['\uFEFFSINOV HISOBOTI — haqiqiy tushum emas\r\nChek,Jami UZS,Holat\r\n'+db.orders.filter(o=>role==='admin'||o.owner===meId()).map(o=>[o.receipt_no,o.price*o.qty,o.status].join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='teja-sinov-hisoboti.csv';link.click();URL.revokeObjectURL(url);return;}if(href.startsWith('/api/receipt')){receipt(new URL(href,'https://preview.teja.local').searchParams.get('id'));return;}if(href.startsWith('/legal')){alert('Shartlar va qaytarish tartibi ZIPdagi serverli loyihada mavjud. Bu previewda haqiqiy xarid bajarilmaydi.');return;}window.previewNavigate(href);},true);
// Embed all bundled images, including JSX absolute paths.
new MutationObserver(()=>{document.querySelectorAll('img[src^="/"]').forEach(img=>{const src=img.getAttribute('src');if(assets[src])img.src=assets[src];});}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
function Preview(){const [route,Route]=useState('/'),[version,V]=useState(0);useEffect(()=>{const fn=e=>{Route(e.detail);V(v=>v+1);window.scrollTo(0,0);};window.addEventListener('preview-route',fn);return()=>window.removeEventListener('preview-route',fn);},[]);return <LanguageProvider><div className="preview-toolbar"><span>TEJA · Namoyish · haqiqiy pul olinmaydi</span><div><button onClick={()=>{if(confirm('Faqat ushbu previewdagi sinov ma’lumotlari tozalansinmi?')){localStorage.removeItem('teja-preview-v3-db');localStorage.removeItem('teja-cart');location.reload();}}}>↻ Yangilash</button>{[['member','Xaridor'],['seller','Sotuvchi'],['admin','Admin'],['guest','Mehmon']].map(([r,label])=><button key={r} className={role===r?'active':''} onClick={()=>{role=r;Route('/');V(v=>v+1);}}>{label}</button>)}</div></div>{route.startsWith('/mock-payment')?<PaymentConfirm key={version} orderId={new URL(route,'https://preview.teja.local').searchParams.get('id')}/>:route.includes('login')||route.includes('register')?<AuthForm key={version} mode={route.includes('register')?'register':'login'}/>:<Home key={version} initialView={route.includes('view=orders')?'orders':route.includes('view=seller')?'seller':route.includes('view=account')?'account':role==='seller'?'seller':role==='admin'?'admin':'map'} initialProducts={seedProducts}/>}</LanguageProvider>;}
createRoot(document.getElementById('root')).render(<Preview/>);
