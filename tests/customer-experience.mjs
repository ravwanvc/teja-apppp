import assert from 'node:assert/strict';
import {load,db,D1,auth,data,buyer,seller,buyerCookie as oldBuyerCookie,sellerCookie,request} from './real-flows.mjs';
import {prepareCart} from '../lib/cart.js';
import {sendOtp} from '../lib/otp.js';
const env=globalThis.testEnv;
env.PAYMENTS_MODE='mock';env.SMS_REQUIRED='false';db.exec('DELETE FROM auth_limits');
const login=await auth.POST(request({action:'login',phone:'+998901234567',password:'correct-password-123'}));
const buyerCookie=login.headers.get('set-cookie').split(';')[0];
globalThis.reqHeaders.set('cookie',buyerCookie);
const template=db.prepare('SELECT * FROM products WHERE owner=? LIMIT 1').get(seller);
function product(id,stock,price){const row={...template,id,stock,price,original:price*2,active:1,until:Date.now()+86400000};const cols=Object.keys(row);db.prepare(`INSERT INTO products(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')})`).run(...cols.map(c=>row[c]));return row;}
const a=product('cart-item-a',3,10000),b=product('cart-item-b',5,20000);
const input={action:'checkout',items:[{id:a.id,qty:2},{id:b.id,qty:3}],provider:'payme',acceptTerms:true,requestId:'cart-order-00000001'};
let r=await data.POST(request(input));assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
let o=db.prepare('SELECT * FROM orders WHERE id=?').get(input.requestId);
assert.equal(o.price,80000);assert.equal(o.deposit,8000);assert.equal(JSON.parse(o.cart_items).length,2);
assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(a.id).stock,1);
assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(b.id).stock,2);
assert.equal((await data.POST(request(input))).status,200,'idempotent cart retry does not recheck deducted inventory');
assert.equal((await data.POST(request({...input,requestId:'cart-order-00000002'}))).status,400,'overselling blocked');
assert.equal((await data.POST(request({action:'cancel',id:o.id}))).status,200);
assert.equal((await data.POST(request({action:'cancel',id:o.id}))).status,200);
assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(a.id).stock,3,'restock once');
assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(b.id).stock,5);
await assert.rejects(prepareCart(D1,[{id:a.id,qty:1},{id:a.id,qty:1}],buyer));
await assert.rejects(
 prepareCart(D1,[{id:a.id,qty:1}],buyer,a.until-9*60*1000),
 /Taklif tugashiga 10 daqiqadan kam qoldi/,
);
await assert.rejects(
 prepareCart(D1,[{id:a.id,qty:4}],buyer),
 /Qoldiq yetarli emas\. Hozir 3 dona qoldi/,
);
const other=product('other-shop-item',4,20000);db.prepare('UPDATE products SET owner=? WHERE id=?').run(buyer,other.id);
await assert.rejects(prepareCart(D1,[{id:a.id,qty:1},{id:other.id,qty:1}],seller));
const community=await import(await load('app/api/community/route.js'));
assert.equal((await community.POST(request({action:'follow',seller,hour:18,enabled:true}))).status,200);
assert.equal(db.prepare('SELECT hour FROM shop_follows WHERE owner=?').get(buyer).hour,18);
db.prepare('UPDATE products SET stock=0 WHERE id=?').run(a.id);
assert.equal((await community.POST(request({action:'wait',id:a.id}))).status,200);
db.prepare('UPDATE products SET stock=2 WHERE id=?').run(a.id);
assert.equal(db.prepare("SELECT count(*) n FROM notifications WHERE owner=? AND kind='available' AND entity=?").get(buyer,a.id).n,1);
assert.equal(db.prepare('SELECT count(*) n FROM waitlist WHERE owner=?').get(buyer).n,0);
// Existing paid order, then quality claim ownership checks.
const paid=db.prepare("SELECT id FROM orders WHERE buyer=? AND status='collected' LIMIT 1").get(buyer);
if(paid){assert.equal((await community.POST(request({action:'claim',id:paid.id,reason:'Mahsulot sifati talabga javob bermadi'}))).status,200);globalThis.reqHeaders.set('cookie',sellerCookie);assert.equal((await community.POST(request({action:'claim',id:paid.id,reason:'Boshqa hisobdan murojaat'}))).status,400);}
// Seller daily form updates available stock once while keeping existing order snapshots.
globalThis.reqHeaders.set('cookie',sellerCookie);
const daily={action:'quickDay',id:a.id,qty:4,price:12000,until:Date.now()+3600000,requestId:'daily-stock-00000001'};
const before=db.prepare('SELECT stock FROM products WHERE id=?').get(a.id).stock;
assert.equal((await data.POST(request(daily))).status,200);
assert.equal((await data.POST(request(daily))).status,200);
assert.equal(db.prepare('SELECT stock FROM products WHERE id=?').get(a.id).stock,before+4);
assert.equal(db.prepare('SELECT price FROM products WHERE id=?').get(a.id).price,12000);
globalThis.reqHeaders.set('cookie',buyerCookie);
assert.equal((await data.POST(request({...daily,requestId:'daily-stock-00000002'}))).status,403);
// Password login no longer needs an SMS. Reset has a separate expiring one-time authorization.
globalThis.reqHeaders.set('cookie',buyerCookie);db.exec('DELETE FROM auth_limits');
assert.equal((await auth.POST(request({action:'login',phone:'+998901234567',password:'buyer-password'}))).status,401,'wrong password rejected');
const phoneApi=await import(await load('app/api/phone/route.js'));
db.prepare('DELETE FROM phone_otps WHERE owner=?').run('reset:+998901234567');
const sent=await sendOtp(env,'+998901234567','reset');
assert.equal((await auth.POST(request({action:'reset',phone:'+998901234567',password:'updated-password',confirmPassword:'updated-password',code:sent.mockCode}))).status,400,'raw OTP cannot skip verification step');
r=await phoneApi.POST(request({action:'verify',purpose:'reset',phone:'+998901234567',code:sent.mockCode}));assert.equal(r.status,200);const {resetToken}=await r.json();
const reset={action:'reset',phone:'+998901234567',password:'updated-password',confirmPassword:'updated-password',resetToken};
assert.equal((await auth.POST(request({...reset,confirmPassword:'mismatched-password'}))).status,400);
assert.equal((await auth.POST(request(reset))).status,200);
assert.equal((await auth.POST(request(reset))).status,400,'reset token cannot be replayed');
assert.equal((await auth.POST(request({action:'login',phone:reset.phone,password:reset.password}))).status,200,'password-only login');
console.log('PASS: atomic multi-item cart, server pricing, idempotency, oversell rejection, exact stock restoration, shop scope, follow/waitlist notifications, claim ownership, verified reset and token replay rejection.');
