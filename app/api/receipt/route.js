import { getMongoDb } from "../../../lib/mongodb.js";
import { getAppUser } from "../../../lib/auth.js";
import { expireOrders } from "../../../lib/commerce.js";
import { directionsLinks } from "../../../lib/directions.js";
import { money } from "../../../lib/format.js";
export async function GET(req) {
  const u = await getAppUser();
  if (!u) return new Response("Hisobga kiring", { status: 401 });
  const db=await getMongoDb();
  await expireOrders(db);
  const id = new URL(req.url).searchParams.get("id");
  const o=await db.collection("orders").findOne({id:id||""});
  const product=o?await db.collection("products").findOne({id:o.product},{projection:{owner:1}}):null;
  const me=await db.collection("users").findOne({id:u.userId},{projection:{role:1}});
  if (
    !o ||
    !product ||
    (o.buyer !== u.userId && product?.owner !== u.userId && me?.role !== "admin")
  )
    return new Response("Ruxsat yo‘q", { status: 403 });
  if (!o.receipt_no)
    return new Response("To‘lov tasdiqlanmagan. Chek mavjud emas.", {
      status: 409,
    });
  const p = typeof o.snapshot==="string"?JSON.parse(o.snapshot||"{}"):(o.snapshot||{}),
    cartItems=Array.isArray(o.cart_items)?o.cart_items:JSON.parse(o.cart_items||"[]"),
    demo = o.provider === "demo" || o.is_mock === 1;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const links = directionsLinks(p);
  const sum = money;
  const date = (n) =>
    n
      ? new Date(n).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })
      : "Belgilanmagan";
  const no = (demo ? "SINOV-" : "") + o.receipt_no;
  const cash=o.provider==='cash';
  const refund=await db.collection('refund_records').findOne({order_id:o.id},{projection:{reference:1,created:1}});
  const rows = [
    ["Brend / do‘kon", p.shop],
    ["Olib ketish manzili", p.address],
    ["Mahsulot", p.title],
    ["Miqdor", o.qty + " dona"],
    ["Bir dona narxi", sum(o.price)],
    ["Jami", sum(o.price * o.qty)],
    [cash?"Oldindan to‘lov":"10% oldindan to‘lov" + (demo ? " (sinov)" : ""), sum(o.deposit)],
    [cash?"Do‘konda to‘liq naqd to‘lov":"Olib ketishda 90%", sum(o.price * o.qty - o.deposit)],
    ["Buyurtma berilgan vaqt", date(o.created)],
    ["To‘lov qayd etilgan vaqt", date(o.paid_at)],
    [
      "Olib ketish muddati",
      date(o.pickup_at) +
        (o.pickup_selected ? "" : " (standart, tanlash mumkin)"),
    ],
    ["To‘lov usuli", demo ? "Namoyish — pul olinmagan" : cash ? "Naqd" : o.provider],
    [
      "Buyurtma holati",
      {
        reserved: "Band qilingan",
        collected: "Topshirilgan",
        expired: "Muddat o‘tgan — bekor qilingan",
        cancelled: "Bekor qilingan",
      }[o.status] || o.status,
    ],
    [
      "Qaytarish holati",
      o.payment_state.includes("refund_due")
        ? "Qaytarish kutilmoqda"
        : o.payment_state==='refunded' ? "Pul qaytarilgan · "+(refund?.reference||"") : cash ? (o.payment_state==='cash_paid'?"Sotuvchi naqd pulni olganini tasdiqladi":"Pul olinmagan") : o.status === "expired"
          ? "Shart bo‘yicha 10% qaytarilmaydi"
          : "—",
    ],
  ];
  for (const item of cartItems) rows.push([item.title + ' × ' + item.qty, sum(item.price*item.qty)]);
  if (o.buyer === u.userId && o.status === "reserved")
    rows.push(["Topshirish kodi", o.code]);
  return new Response(
    `<!doctype html><html lang="uz"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TEJA chek №${esc(no)}</title><script>(()=>{let t="system";try{t=localStorage.getItem("teja-theme")||t}catch{}document.documentElement.dataset.theme=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"})()</script><style>body{font:15px system-ui;background:#f2f5ec;color:#183d30;margin:0;padding:25px}.receipt{background:white;max-width:620px;padding:35px;margin:auto;border-radius:15px}h1{font-size:32px}dl{display:grid;grid-template-columns:1fr 1.3fr;gap:15px;border-top:1px dashed #bbb;padding-top:25px}dt{color:#728071}dd{margin:0;text-align:right;font-weight:600}.notice{padding:15px;background:#edf3e4;border-radius:8px;line-height:1.6}small{display:block;margin-top:25px;color:#73806e}.route-links{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.route-links a{padding:14px 18px;background:#176e51;color:#fff;text-decoration:none;border-radius:9px;font-weight:650}.pickup-guide{line-height:1.7}.pickup-code{display:block;font-size:28px;letter-spacing:4px;margin:12px 0}button{background:#176e51;color:white;border:0;border-radius:8px;padding:13px;cursor:pointer;width:100%;margin-top:20px}html[data-theme="dark"]{color-scheme:dark}html[data-theme="dark"] body{background:#101a16;color:#e6f1e9}html[data-theme="dark"] .receipt{background:#18261f}html[data-theme="dark"] .notice{background:#21352b}html[data-theme="dark"] dt,html[data-theme="dark"] small{color:#a8bbae}@media print{html[data-theme="dark"]{color-scheme:light}html[data-theme="dark"] body,html[data-theme="dark"] .receipt{background:white;color:#183d30}html[data-theme="dark"] .notice{background:#edf3e4}html[data-theme="dark"] dt,html[data-theme="dark"] small{color:#52665a}body{padding:0;background:white}button,.route-links{display:none}.receipt{max-width:none}}</style><div class="receipt"><h1>teja.</h1><h2>Buyurtma cheki №${esc(no)}</h2>${demo ? '<p class="notice"><b>SINOV — PUL OLINMAGAN.</b> Bu sinov buyurtmasi.</p>' : ""}<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>${links ? `<section class="pickup-guide"><h3>Olib ketish joyiga yo‘nalish</h3><p>${esc(p.shop)} · ${esc(p.address)}</p><div class="route-links"><a href="${esc(links.google)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div><p>Xarita ochilgach boshlang‘ich joyingizni tanlang yoki joylashuvga ruxsat bering.</p></section>` : ""}${o.status === "reserved" ? `<section class="notice pickup-guide"><b>Mahsulotni qanday olaman?</b><ol><li>Buyurtmada olib ketish vaqtini belgilang.</li><li>Yuqoridagi xarita orqali do‘konga boring.</li><li>Sotuvchiga topshirish kodini ko‘rsating.${o.buyer === u.userId ? `<strong class="pickup-code">${esc(o.code)}</strong>` : ""}</li><li>${demo ? "Namoyishda sotuvchi kodni kiritib topshirishni tasdiqlaydi. Haqiqiy pul kerak emas." : cash ? "To‘liq summani sotuvchiga naqd to‘lang va mahsulotni oling." : "Qolgan 90% summani sotuvchiga to‘lang va mahsulotni oling."}</li></ol></section>` : ""}<p class="notice">${cash?"Bu naqd buyurtma. Bron pul to‘langanini bildirmaydi. Belgilangan muddatda kelmasangiz bron bekor qilinadi.":"Belgilangan muddatgacha olib ketilmasa, buyurtma avtomatik bekor qilinadi va 10% oldindan to‘lov qaytarilmaydi. Sotuvchi bekor qilsa, qaytarish alohida qayd qilinadi."}</p><small>TEJA buyurtma tasdig‘i. Fiskal chek emas. Barcha vaqtlar Toshkent vaqti bilan.</small><button onclick="window.print()">Chop etish / PDF saqlash</button></div></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
