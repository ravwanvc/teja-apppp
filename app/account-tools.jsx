"use client";
import { useEffect, useState } from "react";
import { Translated } from "./language";
export function ReportButton({
  kind,
  target
}) {
  const [msg, M] = useState("");
  return <>
      <button className="text-link" onClick={async () => {
      const reason = prompt("Shikoyat sababi / Причина жалобы");
      if (!reason) return;
      const r = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          kind,
          target,
          reason
        })
      });
      const d = await r.json();
      M(r.ok ? "Yuborildi / Отправлено" : d.error);
    }}><Translated>{"Shikoyat / \u041F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C\u0441\u044F"}</Translated></button>
      <small role="status">{msg}</small>
    </>;
}
export function AdminQueues() {
  const [reports, R] = useState([]),
    [refunds, F] = useState([]),
    [msg, M] = useState("");
  async function load() {
    try {
      const [a, b] = await Promise.all(["/api/reports", "/api/refunds"].map(async u => {
        const r = await fetch(u);
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      }));
      R(a.reports);
      F(b.orders);
    } catch (e) {
      M(e.message);
    }
  }
  useEffect(() => {
    queueMicrotask(load);
  }, []);
  async function act(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    M(d.error || "Saqlandi / Сохранено");
    load();
  }
  return <section className="approval-panel">
      <h2><Translated>{"Shikoyat va qaytarish / \u0416\u0430\u043B\u043E\u0431\u044B \u0438 \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u044B"}</Translated></h2>
      {reports.map(r => <p key={r.id}>
          {r.kind}: {r.reason} · {r.status}{" "}
          {r.status === "pending" && <button onClick={() => act("/api/reports", {
        action: "resolve",
        id: r.id
      })}><Translated>{"Ko\u2018rib chiqildi / \u0420\u0430\u0441\u0441\u043C\u043E\u0442\u0440\u0435\u043D\u043E"}</Translated></button>}
        </p>)}
      {refunds.map(o => <article className="partner-form" key={o.id}><b>#{o.receipt_no||o.id.slice(0,8)} · {o.provider==='cash'?o.price*o.qty:o.deposit} UZS</b><p>{o.payment_state==='refunded'?'Pul qaytarilgan / Деньги возвращены':'Qaytarish kutilmoqda / Ожидает возврата'}</p>{o.reference&&<p>{o.reference}</p>}{o.payment_state.includes('refund_due')&&(o.is_mock&&o.provider!=='cash'?<button onClick={()=>act('/api/refunds',{id:o.id})}>Qaytarishni sinash / Проверить возврат</button>:<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);act('/api/refunds',{id:o.id,reference:f.get('reference'),confirmed:f.get('confirmed')==='on'});}}><p>Pulni avval xaridorga qaytaring. Bu forma amalga oshirilgan qaytarishni hisobga oladi, bank o‘tkazmasini bajarmaydi. / Сначала верните деньги покупателю; форма фиксирует возврат и не переводит деньги.</p><label>Hujjat raqami / Номер документа<input name="reference" required minLength={5} maxLength={300}/></label><label className="check"><input name="confirmed" type="checkbox" required/>Pul qaytarildi / Деньги возвращены</label><button>Qaytarishni qayd qilish / Записать возврат</button></form>)}</article>)}
      <p role="status">{msg}</p>
    </section>;
}