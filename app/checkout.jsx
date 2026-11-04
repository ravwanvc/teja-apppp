"use client";

import { Translated, useLanguage } from "./language";
import { useClock } from "./use-clock";
import Link from "next/link";
import { money, capitalize } from "../lib/format";
import { MoneyInput } from "./account";
import { useState, useEffect } from "react";
import { CreditCard, Plus, ArrowLeft } from "lucide-react";
import Wallet from "./wallet";
import PickupDirections from "./pickup-directions";
export const orderLabel = o => ({
  pending_payment: "To‘lov kutilmoqda",
  reserved: "Band qilingan",
  collected: "Topshirildi",
  cancelled: "Bekor qilindi",
  expired: "Vaqt o‘tdi — bekor qilindi",
  payment_expired: "To‘lov vaqti tugadi"
})[o.status] || o.status;
export function Checkout({
  product,
  qty,
  me,
  busy,
  onCheckout
}) {
  const {lang}=useLanguage(),t=(u,r)=>lang==='ru'?r:u;
  const [cash,Cash]=useState(false),[method,Method]=useState('online');
  useEffect(()=>{let active=true;fetch('/api/partners?owner='+encodeURIComponent(product.owner||'')).then(r=>r.json()).then(d=>{if(active){Cash(!!d.cash);}}).catch(()=>{});return()=>{active=false;};},[product.owner]);
  const [accepted, A] = useState(false),
    [providers, P] = useState({}),
    [cards, C] = useState([]),
    [cardId, CI] = useState(""),
    [cardMode, CM] = useState(false),
    [adding, Adding] = useState(false),
    [loaded, Loaded] = useState(false),
    [msg, M] = useState("");
  async function loadCards() {
    const r = await fetch("/api/cards");
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Kartalar yuklanmadi");
    const list = Array.isArray(d.cards) ? d.cards : [];
    C(list);
    CI(v => list.some(c => c.id === v) ? v : list[0]?.id || "");
    Loaded(true);
    return list;
  }
  useEffect(() => {
    fetch("/api/payments").then(r => r.json()).then(P).catch(() => M("To‘lov usullari yuklanmadi"));
    queueMicrotask(() => loadCards().catch(e => M(e.message)));
  }, []);
  const total = product.price * qty,
    deposit = Math.ceil(total / 10),
    invalid = !Number.isInteger(qty) || qty < 1 || qty > product.stock;
  async function chooseCard() {
    CM(true);
    M("");
    try {
      const list = loaded ? cards : await loadCards();
      Adding(!list.length);
    } catch (e) {
      M(e.message);
    }
  }
  return <div className="checkout">
      {providers.demo && <p className="demo-banner"><Translated>{"SINOV BUYURTMASI \xB7 Hech qanday haqiqiy pul olinmaydi."}</Translated></p>}
      <div className="checkout-summary">
        <span><Translated>{"BUYURTMA HISOBI"}</Translated></span>
        <p>
          <b>{product.title}</b>
          <small>
            {product.shop} · {qty}<Translated>{"dona"}</Translated></small>
        </p>
        <div>
          <span>
            <Translated>Jami</Translated>
          </span>
          <b>{money(total)}</b>
        </div>
      </div>
      {cash&&<div className="partner-actions"><button type="button" className={method==='cash'?'':'secondary'} onClick={()=>{Method('cash');A(false);}}>{t('To‘liq naqd','Полностью наличными')}</button><button type="button" className={method==='online'?'':'secondary'} onClick={()=>{Method('online');A(false);}}>{t('Onlayn oldindan to‘lov','Предоплата онлайн')}</button></div>}
      {cash&&method==='cash'?<div className="cash-choice"><h3>{t('Do‘konda naqd to‘lash','Оплата наличными в магазине')}</h3><strong>{money(total)}</strong><p>{t('Hozir pul olinmaydi. Mahsulotni olishda to‘liq summani sotuvchiga bering. TEJA komissiyasini do‘kon alohida to‘laydi.','Сейчас оплата не требуется. При получении передайте всю сумму продавцу. Магазин оплачивает комиссию TEJA отдельно.')}</p><p>{t('Bron 30 daqiqa saqlanadi. Keyingi bosqichda mahsulot muddati doirasida 2 soatgacha olish vaqtini tanlashingiz mumkin.','Бронь действует 30 минут. На следующем шаге можно выбрать получение в пределах 2 часов и срока предложения.')}</p><label className="check"><input type="checkbox" checked={accepted} onChange={e=>A(e.target.checked)}/>{t('Vaqtida kelaman yoki bronni oldindan bekor qilaman.','Приду вовремя или заранее отменю бронь.')}</label><button className="full" disabled={busy||!accepted||invalid} onClick={()=>onCheckout('checkout','cash',accepted)}>{t('Naqd to‘lov bilan bron qilish','Забронировать с оплатой наличными')}</button></div>:<>
      <div className="payment-split">
        <div>
          <span>
            <Translated>Hozir — 10%</Translated>
          </span>
          <strong>{money(deposit)}</strong>
          <small><Translated>{"TEJA oldindan to\u2018lovi"}</Translated></small>
        </div>
        <div>
          <span>
            <Translated>Olib ketishda — 90%</Translated>
          </span>
          <strong>{money(total - deposit)}</strong>
          <small>
            <Translated>Bevosita sotuvchiga</Translated>
          </small>
        </div>
      </div>
      <p className="payment-info"><Translated>{"To\u2018lovdan keyin olib ketish vaqtini tanlaysiz: 5 daqiqadan 2 soatgacha, mahsulot muddati doirasida. Vaqt tanlanmasa, standart muddat 30 daqiqa (yoki e\u2019lonning ertaroq tugash vaqti)."}</Translated></p>
      <label className="check deadline-terms">
        <input type="checkbox" checked={accepted} onChange={e => A(e.target.checked)} />
        <span><Translated>{"Belgilangan vaqtgacha olib ketmasam, buyurtmam bekor qilinishini va"}</Translated>{" "}
          <b><Translated>{"10% oldindan to\u2018lov qaytarilmasligini"}</Translated></b><Translated>{"tushundim. Sotuvchi bekor qilsa, qaytarish uchun qayd ochiladi."}</Translated></span>
      </label>
      <p>
        <Link href="/legal/offer" target="_blank"><Translated>{"Oferta / \u041E\u0444\u0435\u0440\u0442\u0430"}</Translated></Link>{" "}
        ·{" "}
        <Link href="/legal/refunds" target="_blank"><Translated>{"Qaytarish / \u0412\u043E\u0437\u0432\u0440\u0430\u0442"}</Translated></Link>{" "}
        ·{" "}
        <Link href="/legal/privacy" target="_blank"><Translated>{"Maxfiylik / \u041A\u043E\u043D\u0444\u0438\u0434\u0435\u043D\u0446\u0438\u0430\u043B\u044C\u043D\u043E\u0441\u0442\u044C"}</Translated></Link>
      </p>
      <h3 className="payment-method-heading"><Translated>{"10% to\u2018lov usulini tanlang"}</Translated></h3>
      <div className="payment-brands uploaded-brands">
        {["click", "payme"].map(provider => <button type="button" key={provider} className={"provider-" + provider} aria-label={(provider === "click" ? "Click" : "Payme") + " orqali " + money(deposit) + " to‘lash"} disabled={busy || !providers[provider] || !accepted || invalid} onClick={() => onCheckout("checkout", provider, accepted)}>
            <span className="provider-image">
              <img src={"/payments/" + provider + "-upload.png"} alt={provider === "click" ? "Click" : "Payme"} />
            </span>
            {!providers.demo && <small>
              {providers[provider] ? "To‘lovga o‘tish" : "Xizmat ulanmagan"}
            </small>}
          </button>)}
      </div>
      <button type="button" className="card-pay-choice full secondary" onClick={chooseCard} disabled={busy}>
        <CreditCard size={23} />
        <span>
          <Translated>Karta orqali to‘lov</Translated>
          <small>
            {cards.length ? "Saqlangan kartadan foydalanish" : "Karta qo‘shish va davom etish"}
          </small>
        </span>
        <span>→</span>
      </button>
      {cardMode && <section className="checkout-card-panel">
          <div className="card-panel-heading">
            <h3>{adding ? "Karta qo‘shish" : "Kartani tanlang"}</h3>
            <button type="button" className="secondary" onClick={() => {
          CM(false);
          Adding(false);
        }} disabled={busy}>
              <ArrowLeft size={15} />
              <Translated>Ortga</Translated>
            </button>
          </div>
          {adding ? <Wallet compact onAdded={async () => {
        await loadCards();
        Adding(false);
        M("Karta qo‘shildi. Endi 10% to‘lovni tasdiqlang.");
      }} /> : <>
              <div className="checkout-cards">
                {cards.map(c => <label key={c.id}>
                    <input type="radio" name="checkout-card" checked={cardId === c.id} onChange={() => CI(c.id)} />
                    <CreditCard size={20} />
                    <span>
                      <b>{c.number}</b>
                      <small>{c.expiry}</small>
                    </span>
                  </label>)}
              </div>
              <button type="button" className="text-link" onClick={() => Adding(true)}>
                <Plus size={15} />
                <Translated>Yangi karta qo‘shish</Translated>
              </button>
              {!providers.card && <p className="wallet-notice"><Translated>{"Karta to\u2018lov xizmati hali ulanmagan. Pul yechilmaydi."}</Translated></p>}
              <button type="button" className="full" disabled={busy || !providers.card || !cardId || !accepted || invalid} onClick={() => onCheckout("checkout", "card", accepted, cardId)}>
                {busy ? "Tekshirilmoqda…" : money(deposit) + " to‘lashni tasdiqlash"}
              </button>
            </>}
        </section>}
      {msg && <p role="status">{msg}</p>}
      <p className="payment-disabled">
        {providers.demo ? "Sinov cheki beriladi. To‘lov xizmatlariga so‘rov yuborilmaydi." : providers.click || providers.payme || providers.card ? "Chek faqat provayder to‘lovni tasdiqlagach beriladi. Bir marta tasdiqlangan to‘lov takror yechilmaydi." : "To‘lov xizmatlari hali sozlanmagan. Rasmlarni bosishning o‘zi pul yechmaydi."}
      </p></> }
    </div>;
}
export function CardPaymentStatus({
  order,
  onUpdate
}) {
  const [busy, B] = useState(false),
    [msg, M] = useState("");
  async function check() {
    B(true);
    try {
      const r = await fetch("/api/payments/card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: order.id
        })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      M(d.message);
      await onUpdate();
    } catch (e) {
      M(e.message);
    } finally {
      B(false);
    }
  }
  return <div className="card-payment-status">
      <p><Translated>{"Karta to\u2018lovi tasdiqlanishi kutilmoqda. Holat tekshirilganda pul qayta yechilmaydi."}</Translated></p>
      <button className="secondary" disabled={busy} onClick={check}>
        {busy ? "Tekshirilmoqda…" : "To‘lov holatini tekshirish"}
      </button>
      {msg && <p role="status">{msg}</p>}
    </div>;
}
export function Schedule({
  order,
  busy,
  onSave
}) {
  const now = useClock();
  const [minutes, M] = useState(30);
  const limit = Math.min((order.paid_at || order.created) + 120 * 60000, order.until);
  return <>
      <div className="eyebrow"><Translated>{"OLIB KETISH VAQTI"}</Translated></div>
      <h2><Translated>{"Qachon olib ketasiz?"}</Translated></h2>
      <p>{order.provider==='cash'?'Vaqtni bir marta tanlang. Kechiksangiz bron bekor qilinadi.':<Translated>{'Bir marta vaqt belgilang. Kechiksangiz buyurtma bekor bo‘ladi va 10% qaytarilmaydi.'}</Translated>}</p>
      <label><Translated>{"Necha daqiqadan keyin?"}</Translated><select value={minutes} onChange={e => M(Number(e.target.value))}>
          {[5, 10, 15, 20, 30, 45, 60, 90, 120].map(n => <option key={n} value={n} disabled={now + n * 60000 > limit}>
              {n}<Translated>{"daqiqadan keyin"}</Translated></option>)}
        </select>
      </label>
      <p className="muted"><Translated>{"Eng kech:"}</Translated>{" "}
        {new Date(limit).toLocaleString("uz-UZ", {
        timeZone: "Asia/Tashkent"
      })}<Translated>{". Chekda tanlangan vaqt yoziladi."}</Translated></p>
      <button className="full" disabled={busy || now + minutes * 60000 > limit} onClick={() => onSave(now + minutes * 60000)}><Translated>{"Vaqtni tasdiqlash"}</Translated></button>
    </>;
}
export function ReceiptReady({
  order,
  onSchedule
}) {
  if (!order) return <p><Translated>{"Chek yuklanmoqda\u2026"}</Translated></p>;
  const demo = order.provider === "demo" || order.is_mock === 1;
  return <>
      <div className="eyebrow">
        {order.provider === "cash" ? "BRON TAYYOR · DO‘KONDA NAQD TO‘LOV" : demo ? "SINOV — PUL OLINMAGAN" : "10% TO‘LOV TASDIQLANDI"}
      </div>
      <h2><Translated>{"Chek \u2116"}</Translated>{demo ? "SINOV-" : ""}
        {order.receipt_no}
      </h2>
      <p>
        {order.title} · {order.qty}<Translated>{"dona"}</Translated></p>
      <div className="payment-split">
        <div>
          <span>{order.provider==='cash'?"Hozir to‘lash":<>10% {demo ? "sinov" : "to‘lov"}</>}</span>
          <strong>{money(order.deposit)}</strong>
        </div>
        <div>
          <span><Translated>{"Sotuvchiga qolgan"}</Translated></span>
          <strong>{money(order.qty * order.price - order.deposit)}</strong>
        </div>
      </div>
      {order.status === "reserved" && order.code && <div className="pickup receipt-pickup-code">
          <small><Translated>{"Sotuvchiga ko\u2018rsating"}</Translated></small>
          <b>{order.code}</b>
          <p><Translated>{"Do\u2018konga boring, kodni ayting va mahsulotni oling."}</Translated></p>
        </div>}
      <PickupDirections place={order} />
      {order.status === "reserved" && !order.pickup_selected && <button className="full" onClick={onSchedule}>
          <Translated>Olib ketish vaqtini tanlash</Translated>
        </button>}
      <Link className="login full" href={"/api/receipt?id=" + encodeURIComponent(order.id)} target="_blank" rel="noreferrer"><Translated>{"Chekni ochish / PDF saqlash \u2197"}</Translated></Link>
      <p className="muted"><Translated>{"Buyurtma cheki \u2014 fiskal chek emas."}</Translated>{" "}
        {demo ? "Sinov cheki haqiqiy to‘lovni tasdiqlamaydi." : ""}
      </p>
    </>;
}