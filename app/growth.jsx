"use client";

import {FreshnessFields} from "./product-freshness";
import { ReportButton } from "./account-tools";
import { Translated } from "./language";
import Link from "next/link";
import { money, capitalize } from "../lib/format";
import { MoneyInput } from "./account";
import { useState } from "react";
const localDate = v => {
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export function EditProduct({
  product,
  busy,
  onSave
}) {
  const [p, P] = useState({
    ...product,
    until: localDate(product.until),
    prepared_at:product.prepared_at?localDate(product.prepared_at):"",best_before:product.best_before?localDate(product.best_before):""
  });
  const set = (k, v) => P(p => ({
    ...p,
    [k]: v
  }));
  return <>
      <div className="eyebrow"><Translated>{"SOTUVCHI / TAHRIRLASH"}</Translated></div>
      <h2>Mahsulotni yangilash</h2>
      <p className="muted">
        Faol buyurtmalar bo‘lsa, avval ularni yakunlang. Eski chekdagi ma’lumot
        o‘zgarmaydi.
      </p>
      <form onSubmit={e => {
      e.preventDefault();
      onSave({
        ...p,
        until: new Date(p.until).getTime(),prepared_at:p.prepared_at?new Date(p.prepared_at).getTime():null,best_before:p.best_before?new Date(p.best_before).getTime():null
      });
    }}>
        <div className="stack">
          <label>
            <Translated>Mahsulot nomi</Translated>
            <input required maxLength={100} value={p.title} onChange={e => set("title", capitalize(e.target.value))} />
          </label>
          <div className="form-grid">
            <label>
              Asl narx
              <MoneyInput required value={p.original} onChange={v => set("original", v)} />
            </label>
            <label>
              Chegirmali narx
              <MoneyInput required value={p.price} onChange={v => set("price", v)} />
            </label>
          </div>
          <label>
            Olib ketish muddati
            <input required type="datetime-local" value={p.until} onChange={e => set("until", e.target.value)} />
          </label><FreshnessFields value={p} onChange={set}/>
          <label>
            Tarkib va allergenlar
            <input required maxLength={250} value={p.allergens} onChange={e => set("allergens", e.target.value)} />
          </label>
          <label>
            Saqlash sharoiti
            <input required maxLength={250} value={p.storage} onChange={e => set("storage", e.target.value)} />
          </label>
        </div>
        <button className="full" disabled={busy}>
          O‘zgarishlarni saqlash
        </button>
      </form>
    </>;
}
export function Restock({
  product,
  busy,
  onSave
}) {
  const [qty, Q] = useState(1);
  return <>
      <h2>Qoldiq qo‘shish</h2>
      <p>
        {product.title} · Hozir {product.stock}<Translated>{"dona"}</Translated></p>
      <form onSubmit={e => {
      e.preventDefault();
      onSave(qty);
    }}>
        <label>
          Necha dona qo‘shiladi?
          <input type="number" min="1" max={10000 - product.stock} required value={qty} onChange={e => Q(Number(e.target.value))} />
        </label>
        <p className="muted">
          Mavjud qoldiqqa qo‘shiladi. Boshqa xaridor band qilgan miqdor
          saqlanadi.
        </p>
        <button className="full" disabled={busy}>
          Qoldiqqa qo‘shish
        </button>
      </form>
    </>;
}
export function ReviewForm({
  order,
  busy,
  onSave
}) {
  const [rating, R] = useState(5),
    [comment, C] = useState("");
  return <>
      <h2>Xaridingiz qanday o‘tdi?</h2>
      <p>{order.title}</p>
      <form onSubmit={e => {
      e.preventDefault();
      onSave(rating, comment);
    }}>
        <div className="rating-picker">
          {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} aria-label={n + " yulduz"} aria-pressed={rating === n} onClick={() => R(n)} className={n <= rating ? "filled" : ""}>
              ★
            </button>)}
        </div>
        <label>
          Izoh
          <textarea required maxLength={1000} rows={4} placeholder="Mahsulot sifati va olib ketish tajribangiz…" value={comment} onChange={e => C(e.target.value)} />
        </label>
        <small>Bir buyurtmaga bir marta baho beriladi.</small>
        <button className="full" disabled={busy}>
          Bahoni yuborish
        </button>
      </form>
    </>;
}
export function Reviews({
  product,
  reviews,
  admin,
  busy,
  onModerate
}) {
  return <>
      <h2>{product.title}</h2>
      <p className="muted">Tasdiqlangan xaridlar baholari</p>
      {!reviews.length ? <p>Hali baho berilmagan.</p> : reviews.map(r => <div className="review-item" key={r.order_id}>
            <span className="rating-stars">
              {"★".repeat(r.rating)}
              {"☆".repeat(5 - r.rating)}
            </span>
            <small>
              {new Date(r.created).toLocaleDateString("uz-UZ")}
              {r.hidden ? " · Yashirilgan" : ""}
            </small>
            <p>{r.comment}</p>
            <ReportButton kind="review" target={r.order_id} />
            {admin && <button disabled={busy} className="secondary" onClick={() => onModerate(r.order_id, !r.hidden)}>
                {r.hidden ? "Qayta ko‘rsatish" : "Yashirish"}
              </button>}
          </div>)}
    </>;
}
export function BusinessProfile({
  me,
  busy,
  onSave
}) {
  const [name, N] = useState(me.business_name || ""),
    [contact, C] = useState(me.business_contact || "");
  return <section className="business-profile">
      <div>
        <h3>Sotuvchi ishonchi</h3>
        <p>
          {me.verified ? "✓ TEJA admini tomonidan tasdiqlangan" : me.verification === "pending" ? "Arizangiz admin tekshiruvida" : me.verification === "rejected" ? "Ariza rad etilgan. Ma’lumotni tekshirib qayta yuboring." : "Biznes ma’lumotini yuboring va admin tasdig‘ini oling."}
        </p>
      </div>
      {!me.verified && <form onSubmit={e => {
      e.preventDefault();
      onSave(name, contact);
    }}>
          <label>
            Biznes nomi
            <input required maxLength={100} value={name} onChange={e => N(e.target.value)} />
          </label>
          <label>
            Biznes aloqa raqami yoki manzili
            <input required maxLength={150} value={contact} onChange={e => C(e.target.value)} />
          </label>
          <button disabled={busy || me.verification === "pending"}>
            Tekshiruvga yuborish
          </button>
        </form>}
    </section>;
}
export function SellerApprovals({
  sellers,
  busy,
  onReview
}) {
  return <section className="approval-panel">
      <h2>Sotuvchilarni tekshirish</h2>
      <p className="muted">
        Tasdiqlashdan oldin biznes ma’lumotini tekshiring. Aloqa ma’lumoti faqat
        adminga ko‘rinadi.
      </p>
      {!sellers.length ? <p className="muted">Hali ariza kelmagan.</p> : sellers.map(s => <div className="approval-row" key={s.id}>
            <div>
              <b>{s.business_name || s.name}</b><small>{s.name}</small>
              <small>{s.business_contact}</small>
              <small>
                {s.verification === "none" ? "Ariza yuborilmagan" : s.verification === "pending" ? "Kutilmoqda" : s.verified ? "Tasdiqlangan" : "Rad etilgan"}
              </small>
            </div>
            <button disabled={busy || s.verified === 1 || s.verification === "none"} onClick={() => onReview(s.id, true)}>
              <Translated>Tasdiqlash</Translated>
            </button>
            <button className="secondary" disabled={busy || s.verification === "rejected" || s.verification === "none"} onClick={() => onReview(s.id, false)}>
              {s.verified ? "Tasdiqni bekor qilish" : "Rad etish"}
            </button>
          </div>)}
    </section>;
}
export function SalesReport({
  report
}) {
  if (!report) return null;
  return <section className="sales-report">
      <div className="section-head">
        <div>
          <div className="eyebrow"><Translated>{"BARCHA DAVR / YAKUNLANGAN SAVDOLAR"}</Translated></div>
          <h2>Biznes natijalari</h2>
        </div>
        <Link className="login" href="/api/report">
          CSV hisobot ↓
        </Link>
      </div>
      <div className="stats">
        <div>
          <small>Topshirilgan buyurtmalar</small>
          <strong>{report.orders_count}</strong>
          <span>{report.units} dona mahsulot</span>
        </div>
        <div>
          <small>Jami savdo</small>
          <strong>{money(report.revenue)}</strong>
          <span>Sinov buyurtmalarisiz</span>
        </div>
        <div>
          <small>Sotuvchi ulushi</small>
          <strong>{money(report.revenue - report.commission)}</strong>
          <span>TEJA komissiyasi: {money(report.commission)}</span>
        </div>
      </div>
    </section>;
}