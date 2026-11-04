"use client";
import { useEffect, useState, useRef } from "react";
import { CardMark } from "./wallet";
import { formatCard, cardBrand } from "../lib/format";
import {
  formatExpiry,
  validExpiry,
  phoneDigits,
  pastedPhone,
} from "../lib/card-form";
export default function DemoWallet({ compact = false, onAdded }) {
  const [cards, C] = useState([]),
    [number, N] = useState(""),
    [expiry, E] = useState(""),
    [phone, P] = useState(""),
    [msg, M] = useState(""),
    [busy, B] = useState(false);
  const lock = useRef(false);
  const brand = cardBrand(number);
  async function reload() {
    const r = await fetch("/api/cards");
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    C(d.cards || []);
  }
  useEffect(() => {
    queueMicrotask(() => reload().catch((e) => M(e.message)));
  }, []);
  async function send(body) {
    const r = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    await reload();
  }
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    B(true);
    try {
      if (
        !["uzcard", "humo", "visa"].includes(brand) ||
        number.replace(/\D/g, "").length !== 16 ||
        !validExpiry(expiry) ||
        phone.length !== 9
      )
        throw Error(
          "16 xonali karta, amal qilish muddati va 9 xonali telefonni tekshiring",
        );
      await send({
        action: "add",
        brand,
        last4: number.replace(/\D/g, "").slice(-4),
        expiry,
      });
      N("");
      E("");
      P("");
      e.target.reset();
      M("Sinov kartasi qo‘shildi. SMS talab qilinmaydi.");
      await onAdded?.();
    } catch (e) {
      M(e.message);
    } finally {
      lock.current = false;
      B(false);
    }
  }
  return (
    <div className={compact ? "wallet-grid compact-wallet" : "wallet-grid"}>
      {!compact && (
        <section>
          <h2>Mening kartalarim</h2>
          {!cards.length && <p>Hali karta qo‘shilmagan.</p>}
          {cards.map((c) => (
            <article className={"bank-card " + c.brand} key={c.id}>
              <div className="bc-top">
                <span className="bc-label">TEJA HAMYONI</span>
                <CardMark brand={c.brand} />
              </div>
              <div className="bc-chip" aria-hidden="true">
                <i />
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8.5 8.5a5 5 0 0 1 0 7M12 6a8.5 8.5 0 0 1 0 12M15.5 3.5a12 12 0 0 1 0 17" /></svg>
              </div>
              <strong className="bc-number">{c.number}</strong>
              <div className="bc-bottom">
                <div>
                  <small>AMAL QILISH MUDDATI</small>
                  <span>{c.expiry}</span>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    B(true);
                    try {
                      await send({ action: "remove", id: c.id });
                    } catch (e) {
                      M(e.message);
                    } finally {
                      B(false);
                    }
                  }}
                >
                  Olib tashlash
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <section className="card-form custom-card-form">
        <div className="eyebrow">SHAXSIY HAMYON</div>
        <h2>Karta qo‘shish</h2>
        <p className="wallet-notice">
          Sinov rejimi. Haqiqiy karta kiritmang. SMS yuborilmaydi, pul
          yechilmaydi. Faqat oxirgi 4 raqam saqlanadi.
        </p>
        <div className="demo-presets">
          {[
            ["uzcard", "8600 0000 0000 0000"],
            ["humo", "9860 0000 0000 0000"],
            ["visa", "4242 4242 4242 4242"],
          ].map(([b, n]) => (
            <button
              type="button"
              className="secondary preset-tile"
              aria-label={b.toUpperCase()}
              key={b}
              onClick={() => {
                N(n);
                E("12/30");
                P("901234567");
              }}
            >
              <CardMark brand={b} />
            </button>
          ))}
        </div>
        <form onSubmit={save} autoComplete="off">
          <label>
            Karta raqami
            <div className="card-number-field">
              <input
                aria-label="Karta raqami"
                value={number}
                required
                minLength={19}
                maxLength={19}
                inputMode="numeric"
                placeholder="0000 0000 0000 0000"
                onChange={(e) => N(formatCard(e.target.value))}
              />
              <CardMark brand={brand} />
            </div>
          </label>
          <div className="card-detail-fields">
            <label>
              Amal qilish muddati
              <input
                aria-label="Amal qilish muddati"
                required
                value={expiry}
                placeholder="OO/YY"
                maxLength={5}
                inputMode="numeric"
                onChange={(e) => E(formatExpiry(e.target.value))}
              />
            </label>
            {brand === "visa" && (
              <label>
                Sinov CVV
                <input
                  aria-label="Sinov CVV"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123"
                  maxLength={3}
                  pattern="[0-9]{3}"
                  required
                  onInput={(e) =>
                    (e.target.value = e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 3))
                  }
                />
              </label>
            )}
          </div>
          <label>
            Telefon
            <div className="phone-field">
              <span>+998</span>
              <input
                aria-label="Telefon"
                value={phone}
                required
                minLength={9}
                maxLength={9}
                inputMode="numeric"
                pattern="[0-9]{9}"
                placeholder="901234567"
                onChange={(e) => P(phoneDigits(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  P(pastedPhone(e.clipboardData.getData("text")));
                }}
              />
            </div>
          </label>
          <button className="full" disabled={busy}>
            {busy ? "Saqlanmoqda…" : "SMSsiz sinov kartasini qo‘shish"}
          </button>
        </form>
        <p role="status">{msg}</p>
        <small>
          To‘liq karta raqami, telefon va CVV serverga yuborilmaydi va
          saqlanmaydi.
        </small>
        <div className="wallet-real-logos">
          <span>
            <img src="/payments/click-upload.png" alt="Click" />
          </span>
          <span>
            <img src="/payments/payme-upload.png" alt="Payme" />
          </span>
        </div>
      </section>
    </div>
  );
}
