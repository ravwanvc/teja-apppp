"use client";


import { Translated } from "./language";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ProfilePhoto } from "./experience";
import Wallet from "./wallet";
import PhotoPicker from "./photo-picker";
import { groupDigits } from "../lib/format";
export function MoneyInput({
  value,
  onChange,
  ...props
}) {
  return <input {...props} type="text" inputMode="numeric" maxLength={11} value={groupDigits(value)} onChange={e => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 9)))} />;
}
export function Account({
  me,
  onUpdate
}) {
  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "logout"
      })
    });
    location.assign("/login");
  }
  return <section className="dashboard">
      <div className="section-head">
        <h1>
          <Translated>Hisobim va kartalar</Translated>
        </h1>
        {me && <button className="secondary" onClick={logout}>
            <Translated>Hisobdan chiqish</Translated>
          </button>}
      </div>
      {!me ? <Link className="login" href="/login">
          <Translated>Kirish</Translated>
        </Link> : <>
          <ProfilePhoto me={me} onUpdate={onUpdate} />
          <div className="wallet-notice">
            <b>
              {me.name} ·{" "}
              {me.role === "admin" ? "Admin" : me.role === "seller" ? "Sotuvchi" : "Xaridor"}
            </b>
            <p><Translated>{"Hisob telefon va parol orqali himoyalangan."}</Translated></p>
          </div>
          <Wallet />
        </>}
    </section>;
}
export function ServiceStatus() {
  const [data, D] = useState(null);
  useEffect(() => {
    fetch("/api/services").then(r => r.json()).then(D).catch(() => {});
  }, []);
  if (!data?.services) return null;
  return <section className="approval-panel">
      <h2><Translated>{"Xizmatlarning ulanish holati"}</Translated></h2>
      <p>
        To‘lovlar sinov rejimida ishlaydi. Haqiqiy pul yechilmaydi, SMS yuborilmaydi.
      </p>
      <div className="service-grid">
        {data.services.map(s => <div className="service-card" key={s.name}>
            <span className="status">
              {s.configured ? "Sozlangan" : "Ulanmagan"}
            </span>
            <h3>{s.name}</h3>
            <p>{s.note}</p>
            <code>{s.keys.join(", ")}</code>
          </div>)}
      </div>

    </section>;
}
export function ImageModeration({
  products,
  busy,
  onDecide
}) {
  const list = products.filter(p => ["review", "pending"].includes(p.image_status));
  return <section className="approval-panel">
      <h2>Rasmlarni tekshirish ({list.length})</h2>
      <p className="muted">
        AI ulanmagan yoki noaniq baholagan rasmlar. Tasdiqlashdan oldin
        mahsulotning o‘zi ko‘rinishini tekshiring.
      </p>
      {!list.length ? <p><Translated>{"Kutilayotgan rasm yo\u2018q."}</Translated></p> : list.map(p => <article className="approval-row" key={p.id}>
            <img src={p.image} alt={p.title} style={{
        width: 100,
        height: 85,
        objectFit: "cover",
        borderRadius: 9
      }} />
            <div>
              <b>{p.title}</b>
              <small>{p.image_note}</small>
            </div>
            <button disabled={busy} onClick={() => onDecide(p.id, true)}>
              <Translated>Tasdiqlash</Translated>
            </button>
            <button disabled={busy} className="secondary" onClick={() => onDecide(p.id, false)}><Translated>{"Boshqa rasm so\u2018rash"}</Translated></button>
          </article>)}
    </section>;
}
export function ReplaceImage({
  product,
  onSave
}) {
  const [pending, P] = useState(false),
    [busy, B] = useState(false),
    [url, U] = useState(""),
    [msg, M] = useState("");
  return <>
      <h2>
        <Translated>Mahsulot rasmini yangilash</Translated>
      </h2>
      <p>{product.title}</p>
      <PhotoPicker value={url || product.image} onBusy={B} onPending={P} onChange={(url, review) => {
      U(url);
      M(review.note);
    }} />
      <p role="status">{msg}</p>
      <button disabled={busy || pending || !url} className="full" onClick={() => onSave(url)}>
        <Translated>Yangi rasmni saqlash</Translated>
      </button>
    </>;
}