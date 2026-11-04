"use client";
import {Translated} from "./language";

import { useClock } from "./use-clock";
import { useState } from "react";
import { Search, Copy, Share2, Clock, Package, AlertCircle } from "lucide-react";
import { money } from "../lib/format";
import { listingState } from "../lib/listing-tools";
import { MoneyInput } from "./account";
const states = {
  all: "Barchasi",
  active: "Faol",
  low: "Kam qoldi",
  soldout: "Tugagan",
  expired: "Muddat o‘tgan",
  hidden: "Yashirilgan",
  review: "Rasm tekshiruvda",
  rejected: "Rasm rad etilgan"
};
export function SellerInventory({
  products,
  me,
  busy,
  onEdit,
  onRestock,
  onImage,
  onReviews,
  onToggle,
  onCopy
}) {
  const now = useClock();
  const [query, Q] = useState(""),
    [filter, F] = useState("all"), [category, C] = useState("");
  const list = products.filter(p => (!category || p.category === category) && (filter === "all" || listingState(p) === filter || filter === "active" && listingState(p) === "low" || filter === "soon" && p.active && p.stock > 0 && p.until > now && p.until < now + 7200000) && `${p.title} ${p.shop}`.toLowerCase().includes(query.toLowerCase()));
  const counts = products.reduce((m, p) => {
    const s = listingState(p);
    m[s] = (m[s] || 0) + 1;
    if (p.active && p.stock > 0 && p.until > now && p.until < now + 7200000) m.soon++;
    return m;
  }, {
    soon: 0
  });
  return <section className="inventory-panel">
      <div className="inventory-alerts">
        <button className="alert-tile" onClick={() => F("low")}>
          <Package size={20} />
          <strong>{counts.low || 0}</strong>
          <span><Translated>{"Mahsulot kam qoldi"}</Translated></span>
        </button>
        <button className="alert-tile" onClick={() => F("soon")}>
          <Clock size={20} />
          <strong>{counts.soon}</strong>
          <span><Translated>{"2 soat ichida tugaydi"}</Translated></span>
        </button>
        <button className="alert-tile" onClick={() => F("review")}>
          <AlertCircle size={20} />
          <strong>{counts.review || 0}</strong>
          <span><Translated>{"Rasm tekshiruvda"}</Translated></span>
        </button>
      </div>
      <div className="section-head">
        <h2><Translated>{"Mahsulotlar va qoldiq"}</Translated></h2>
        <span className="muted">{list.length}<Translated>{"ta ko\u2018rsatilmoqda"}</Translated></span>
      </div>
      <div className="tools">
        <div className="search">
          <Search size={18} />
          <input aria-label="O‘z mahsulotlarimdan izlash" placeholder="Mahsulot yoki do‘kon…" value={query} onChange={e => Q(e.target.value)} />
        </div>
        <select aria-label="Mahsulot kategoriyasi" value={category} onChange={e=>C(e.target.value)}><option value="">Barcha kategoriyalar / Все категории</option>{[...new Set(products.map(p=>p.category))].map(c=><option key={c}>{c}</option>)}</select>
        <select aria-label="Mahsulot holati" value={filter} onChange={e => F(e.target.value)}>
          {Object.entries({
          ...states,
          soon: "2 soat ichida tugaydi"
        }).map(([k, v]) => <option key={k} value={k}>
                {v}
              </option>)}
        </select>
      </div>
      <div className="inventory-cards">
        {list.map(p => <article className="inventory-card" key={p.id}>
            <img src={p.image} alt={p.title} />
            <div className="inventory-main">
              <span className={"status " + listingState(p)}>
                {states[listingState(p)]}
              </span>
              <h3>{p.title}</h3>
              <p>
                {p.shop} · <b>{money(p.price)}</b>
              </p>
              <small>
                {new Date(p.until).toLocaleString("uz-UZ", {
              timeZone: "Asia/Tashkent"
            })}{" "}<Translated>{"gacha"}</Translated></small>
            </div>
            <div className="inventory-stock">
              <b>{p.stock}</b>
              <small><Translated>{"dona qoldi"}</Translated></small>
            </div>
            <div className="inventory-actions">
              {me.role === "seller" && p.owner === me.id && <>
                  <button className="secondary" disabled={busy} onClick={() => onEdit(p)}><Translated>{"Tahrirlash"}</Translated></button>
                  <button className="secondary" disabled={busy} onClick={() => onRestock(p)}><Translated>{"+ Qoldiq"}</Translated></button>
                </>}
              {me.role === "seller" && p.owner === me.id && <>
                  <button className="secondary" disabled={busy} onClick={() => onImage(p)}><Translated>{"Rasm / kamera"}</Translated></button>
                  <button className="secondary" disabled={busy} onClick={() => onCopy(p)}>
                    <Copy size={14} /><Translated>{"Yangi partiya"}</Translated></button>
                </>}
              <button className="secondary" onClick={() => onReviews(p)}><Translated>{"Baholar"}</Translated></button>
              <button className="secondary" disabled={busy} onClick={() => onToggle(p)}>
                {p.active ? "Yashirish" : "Ko‘rsatish"}
              </button>
            </div>
          </article>)}
      </div>
      {!list.length && <div className="empty">
          <Package />
          <h3><Translated>{"Bu holatda mahsulot yo\u2018q"}</Translated></h3>
          <button className="secondary" onClick={() => {
        F("all");
        C("");
        Q("");
      }}><Translated>{"Barchasini ko\u2018rish"}</Translated></button>
        </div>}
    </section>;
}
export function ShareProduct({
  product
}) {
  const [msg, M] = useState(""),
    [url, U] = useState("");
  async function share() {
    const link = new URL("/", location.origin);
    link.searchParams.set("product", product.id);
    U(link.href);
    try {
      if (navigator.share) await navigator.share({
        title: product.title,
        text: product.shop + " · " + money(product.price),
        url: link.href
      });else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link.href);
        M("Havola nusxalandi");
      } else M("Havolani quyidan nusxalang");
    } catch (e) {
      if (e.name !== "AbortError") M("Havolani quyidan nusxalang");
    }
  }
  return <div className="share-product">
      <button className="secondary" onClick={share}>
        <Share2 size={16} /><Translated>{"Ulashish"}</Translated></button>
      {msg && <small role="status">{msg}</small>}
      {url && <input aria-label="Mahsulot havolasi" readOnly value={url} onFocus={e => e.target.select()} />}
    </div>;
}
export function MarketFilters({
  maxPrice,
  onMaxPrice,
  soon,
  onSoon
}) {
  return <div className="market-filters">
      <label><Translated>{"Eng yuqori narx, so\u2018m"}</Translated><MoneyInput value={maxPrice} onChange={onMaxPrice} placeholder="Cheklanmagan" aria-label="Eng yuqori narx" />
      </label>
      <button className={"secondary " + (soon ? "active" : "")} aria-pressed={soon} onClick={() => onSoon(!soon)}>
        <Clock size={16} /><Translated>{"2 soat ichida olib ketish"}</Translated></button>
      {(maxPrice || soon) && <button className="text-link" onClick={() => {
      onMaxPrice("");
      onSoon(false);
    }}><Translated>{"Filtrlarni tozalash"}</Translated></button>}
    </div>;
}