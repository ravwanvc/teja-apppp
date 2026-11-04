"use client";

import {FreshnessFields} from "./product-freshness";
import { Translated } from "./language";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Save, FileText, Trash2, MapPin, Clock, Camera } from "lucide-react";
import PhotoPicker from "./photo-picker";
import MapPicker from "./map-picker";
import { MoneyInput } from "./account";
import { money, capitalize } from "../lib/format";
import { emptyListing, listingCategories, listingIssues } from "../lib/listing-tools";
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,"0")).join("");
async function draftApi(body) {
  const r = await fetch("/api/drafts", body ? {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  } : {});
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
export function DraftShelf({
  onOpen,
  refreshKey
}) {
  const [drafts, D] = useState([]),
    [msg, M] = useState(""),
    [removing, R] = useState(null),
    [busy, B] = useState(false);
  async function load() {
    try {
      D((await draftApi()).drafts);
      M("");
    } catch (e) {
      M(e.message);
    }
  }
  useEffect(() => {
    queueMicrotask(load);
  }, [refreshKey]);
  async function remove(d) {
    B(true);
    try {
      await draftApi({
        action: "delete",
        id: d.id,
        version: d.version
      });
      R(null);
      await load();
    } catch (e) {
      M(e.message);
    } finally {
      B(false);
    }
  }
  return <details className="draft-shelf"><summary><Translated>Qoralamalar</Translated> ({drafts.length})</summary>
      <div className="section-head">
        <div>
          <div className="eyebrow">KEYIN DAVOM ETTIRING</div>
          <h2>
            <FileText size={21} />
            <Translated>Qoralamalar</Translated>{" "}
            <span className="number">{drafts.length}</span>
          </h2>
        </div>
        <button className="secondary" onClick={load}>
          <Translated>Yangilash</Translated>
        </button>
      </div>
      {drafts.length ? <div className="draft-grid">
          {drafts.map(d => <article className="draft-card" key={d.id}>
              {d.body.image ? <img src={d.body.image} alt="Qoralama rasmi" /> : <span className="draft-icon">
                  <Camera />
                </span>}
              <div>
                <h3>{d.body.title || "Nomsiz mahsulot"}</h3>
                <small>
                  {new Date(d.updated).toLocaleString("uz-UZ", {
              timeZone: "Asia/Tashkent"
            })}
                </small>
                <div className="row-tools">
                  <button onClick={() => onOpen(d)}>
                    <Translated>Davom ettirish</Translated>
                  </button>
                  <button className="secondary" aria-label={(d.body.title || "Qoralama") + "ni o‘chirish"} onClick={() => R(d.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
                {removing === d.id && <p>
                    Qoralama o‘chirilsinmi?{" "}
                    <button disabled={busy} className="text-link" onClick={() => remove(d)}>
                      Ha, o‘chirish
                    </button>{" "}
                    <button className="text-link" onClick={() => R(null)}>
                      Qoldirish
                    </button>
                  </p>}
              </div>
            </article>)}
        </div> : <p className="muted">
          Yangi e’lon oynasida «Qoralamani saqlash»ni bosing. Hisobingizga qayta
          kirib davom ettirishingiz mumkin.
        </p>}
      {msg && <p role="status" className="error">
          {msg}
        </p>}
    </details>;
}
export default function ListingStudio({
  draft,
  copy,
  defaults,
  onDone,
  onBusy = () => {}
}) {
  const [form, F] = useState(() => ({
      ...emptyListing(),
      ...defaults,
      ...(copy ? {
        ...copy,
        stock: "",
        until: "", prepared_at:"",best_before:""
      } : {}),
      ...draft?.body
    })),
    [step, S] = useState(0),
    [busy, B] = useState(false),
    [photoBusy, PB] = useState(false),
    [photoPending, PP] = useState(false),
    [msg, M] = useState(""),
    [saved, SV] = useState(!!draft),
    [review, R] = useState(null),
    [accepted, A] = useState(false),
    [errors, E] = useState({});
  const id = useRef(draft?.id || null),
    version = useRef(draft?.version || 0),
    dirty = useRef(false);
  useEffect(() => {
    id.current ||= uid();
  }, []);
  useEffect(() => {
    onBusy(busy || photoBusy);
    return () => onBusy(false);
  }, [busy, photoBusy]);
  useEffect(() => {
    const h = e => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);
  const update = (k, v) => {
    F(f => ({
      ...f,
      [k]: v
    }));
    SV(false);
    dirty.current = true;
    E(x => ({
      ...x,
      [k]: null
    }));
  };
  async function save() {
    B(true);
    M("");
    try {
      const d = await draftApi({
        action: "save",
        id: id.current,
        version: version.current,
        body: form
      });
      version.current = d.version;
      dirty.current = false;
      SV(true);
      M("Qoralama hisobingizda saqlandi.");
    } catch (e) {
      M(e.message);
    } finally {
      B(false);
    }
  }
  function next() {
    const issues = listingIssues(form);
    const keys = step === 0 ? ["image"] : step === 1 ? ["title", "shop", "price", "original", "stock", "until", "freshness", "allergens", "storage"] : ["location", "address"];
    const relevant = Object.fromEntries(Object.entries(issues).filter(([k]) => keys.includes(k)));
    E(relevant);
    if (Object.keys(relevant).length) {
      M("Belgilangan maydonlarni to‘ldiring");
      return;
    }
    M("");
    S(step + 1);
  }
  async function publish() {
    const issues = listingIssues(form);
    E(issues);
    if (Object.keys(issues).length) {
      M("Maydonlarni tekshiring va muddatni yangilang");
      S(issues.image ? 0 : ["title", "shop", "price", "original", "stock", "until", "freshness", "allergens", "storage"].some(k => issues[k]) ? 1 : 2);
      return;
    }
    if (!accepted) return;
    B(true);
    M("");
    try {
      const r = await fetch("/api/data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "create",
          requestId: id.current,
          draftVersion: version.current,
          product: {
            ...form,
            until: new Date(form.until).getTime(),
            prepared_at:form.prepared_at?new Date(form.prepared_at).getTime():null,
            best_before:form.best_before?new Date(form.best_before).getTime():null,
            stock: Number(form.stock),
            price: Number(form.price),
            original: Number(form.original)
          }
        })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      dirty.current = false;
      onDone(d);
    } catch (e) {
      M(e.message);
    } finally {
      B(false);
    }
  }
  const err = k => errors[k] && <small className="field-error">{errors[k]}</small>;
  const total = Number(form.price || 0) * Number(form.stock || 0);
  return <div className="listing-studio">
      <div className="eyebrow">ISROFDAN DAROMADGA</div>
      <h2>
        {draft ? "Qoralamani davom ettirish" : copy ? "Yangi partiyani joylash" : "Yangi mahsulot joylash"}
      </h2>
      <p className="muted">
        {copy ? "Do‘kon va mahsulot ma’lumotlari ko‘chirildi. Yangi rasm, miqdor va muddatni belgilang." : "Rasm oling, narxni belgilang va xaridorlarga ko‘rsating."}
      </p>
      <ol className="studio-steps">
        {["Rasm", "Ma’lumot", "Manzil", "Ko‘rib chiqish"].map((name, i) => <li key={name} className={i === step ? "current" : i < step ? "complete" : ""}>
            <button type="button" disabled={busy || photoBusy || photoPending || i > step} onClick={() => {
          S(i);
          M("");
        }}>
              <span>{i < step ? <Check size={14} /> : i + 1}</span>
              {name}
            </button>
          </li>)}
      </ol>
      <fieldset disabled={busy} className="studio-content">
        {step === 0 ? <>
            <PhotoPicker value={form.image} onBusy={PB} onPending={PP} onChange={(url, r) => {
          update("image", url);
          R(r);
        }} />
            <div className="grid">
              {(form.images || []).filter(url => url !== form.image).map(url => <div key={url}>
                    <img src={url} alt="Qo‘shimcha rasm / Дополнительное фото" style={{
              width: 100
            }} />
                    <button type="button" onClick={() => update("images", form.images.filter(x => x !== url))}>
                      ×
                    </button>
                  </div>)}
            </div>
            {(form.images || []).length < 2 && form.image && <PhotoPicker value="" onBusy={PB} onPending={PP} onChange={url => update("images", [...(form.images || []), url])} />}
            {err("image")}
            {review && <div className="wallet-notice">{review.note}</div>}
          </> : step === 1 ? <div className="form-grid">
            <label><Translated>{"Shahar / \u0413\u043E\u0440\u043E\u0434"}</Translated><select value={form.city || "Toshkent"} onChange={e => update("city", e.target.value)}>
                {["Toshkent", "Samarqand", "Buxoro", "Andijon", "Namangan", "Farg‘ona", "Nukus", "Qarshi", "Termiz"].map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <Translated>Mahsulot nomi</Translated>
              <input maxLength={100} value={form.title} placeholder="Masalan, yangi pishgan non" onChange={e => update("title", capitalize(e.target.value))} />
              {err("title")}
            </label>
            <label>
              <Translated>Do‘kon yoki brend</Translated>
              <input maxLength={100} value={form.shop} onChange={e => update("shop", e.target.value)} placeholder="Do‘koningiz nomi" />
              {err("shop")}
            </label>
            <label>
              <Translated>Toifa</Translated>
              <select value={form.category} onChange={e => update("category", e.target.value)}>
                {listingCategories.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <Translated>Miqdor, dona</Translated>
              <input type="number" min={1} max={10000} value={form.stock} onChange={e => update("stock", e.target.value)} />
              {err("stock")}
            </label>
            <label>
              Asl narx, so‘m
              <MoneyInput value={form.original} onChange={v => update("original", v)} />
              {err("original")}
            </label>
            <label>
              Chegirmali narx, so‘m
              <MoneyInput value={form.price} onChange={v => update("price", v)} />
              {err("price")}
            </label>
            <div className="listing-math">
              <strong>
                {Number(form.original) > Number(form.price) && form.price ? Math.round((1 - form.price / form.original) * 100) + "% chegirma" : "Narxni belgilang"}
              </strong>
              <span>
                Bir donadan tejash:{" "}
                {money(Math.max(0, form.original - form.price))}
              </span>
            </div>
            <label>
              Olib ketishning oxirgi vaqti
              <input type="datetime-local" value={form.until} onChange={e => update("until", e.target.value)} />
              {err("until")}
            </label>
            <FreshnessFields value={form} onChange={update}/>{err("freshness")}
            <label>
              <Translated>Tarkibi va allergenlar</Translated>
              <input maxLength={250} placeholder="Un, sut, tuxum…" value={form.allergens} onChange={e => update("allergens", e.target.value)} />
              {err("allergens")}
            </label>
            <label>
              Saqlash sharoiti
              <input maxLength={250} placeholder="Salqin joyda…" value={form.storage} onChange={e => update("storage", e.target.value)} />
              {err("storage")}
            </label>
          </div> : step === 2 ? <>
            <h3>
              <MapPin size={18} /> Qayerdan olib ketiladi?
            </h3>
            <MapPicker city={form.city} initial={form} onPick={(lat, lng, address) => {
          F(f => ({
            ...f,
            lat,
            lng,
            address
          }));
          SV(false);
          dirty.current = true;
        }} />
            {err("location")}
            <label className="address-label">
              Aniq manzil
              <input maxLength={500} placeholder="Ko‘cha, bino, mo‘ljal" value={form.address} onChange={e => update("address", e.target.value)} />
              {err("address")}
            </label>
            <p className="muted">
              Telefoningiz va manzil boshqa bo‘lsa, xaritada do‘konning
              nuqtasini tanlang.
            </p>
          </> : <>
            <div className="listing-preview">
              <img src={form.image} alt={form.title} />
              <div>
                <span className="eyebrow">E’LON KO‘RINISHI</span>
                <small>
                  {form.shop} · {form.category}
                </small>
                <h2>{form.title}</h2>
                <del>{money(form.original)}</del>
                <strong>{money(form.price)}</strong>
                <p>
                  {form.stock}<Translated>{"dona \xB7"}</Translated>{" "}
                  {Math.round((1 - form.price / form.original) * 100)}% chegirma
                </p>
                <p>
                  <MapPin size={15} />
                  {form.address}
                </p>
                <p>
                  <Clock size={15} />
                  {new Date(form.until).toLocaleString("uz-UZ", {
                timeZone: "Asia/Tashkent"
              })}{" "}<Translated>{"gacha"}</Translated></p>
              </div>
            </div>
            <div className="listing-math">
              <span>
                Hammasi sotilsa: <b>{money(total)}</b>
              </span>
              <span>
                10% oldindan TEJA’ga, qolgan 90% olib ketishda sotuvchiga.
              </span>
            </div>
            <p className="muted">
              Tarkibi: {form.allergens}. Saqlash: {form.storage}.
            </p>
            <label className="check">
              <input type="checkbox" checked={accepted} onChange={e => A(e.target.checked)} />
              Mahsulot iste’molga yaroqli, rasmdagidek va ma’lumotlari to‘g‘ri
              ekanligini tasdiqlayman.
            </label>
          </>}
      </fieldset>
      {photoPending && <p className="studio-message">
          Davom etishdan oldin tanlangan rasmni yuklang yoki bekor qiling.
        </p>}
      {msg && <p role="status" className="studio-message">
          {msg}
        </p>}
      <div className="studio-footer">
        <button className="secondary" type="button" disabled={busy || photoBusy || photoPending} onClick={save}>
          <Save size={16} />
          {saved ? "Qoralama saqlangan" : "Qoralamani saqlash"}
        </button>
        <div>
          {step > 0 && <button className="secondary" disabled={busy || photoBusy || photoPending} onClick={() => S(step - 1)}>
              <ArrowLeft size={16} />
              <Translated>Ortga</Translated>
            </button>}
          {step < 3 ? <button disabled={busy || photoBusy || photoPending} onClick={next}>
              Davom etish <ArrowRight size={16} />
            </button> : <button disabled={busy || photoBusy || photoPending || !accepted} onClick={publish}>
              {busy ? "Joylanmoqda…" : "E’lonni joylash"}
              <Check size={16} />
            </button>}
        </div>
      </div>
      <small className="muted">
        Yopishdan oldin qoralamani saqlang. Qoralama xaridorlarga ko‘rinmaydi.
      </small>
    </div>;
}