"use client";

import { Translated, useLanguage, LanguageSwitcher } from "./language";
import {PanelNav, PanelOverview, UsersDirectory, StockActivity} from "./panel-workspace";
import ThemeSwitcher from './theme-switcher';
import { ShopFollow, PickupQR, ScanPickup, CartPanel, DailyListing } from './experience';
import Link from "next/link";
import { canSell, allowedView } from "../lib/roles.js";
import { AdminQueues, ReportButton } from "./account-tools";
import DiscoveryMap from "./discovery-map";
import { distanceKm } from "../lib/map-discovery";
import PartnersPanel from "./partners-panel";
import {Freshness} from "./product-freshness";
import ListingStudio, { DraftShelf } from "./listing-studio";
import { SellerInventory, ShareProduct, MarketFilters } from "./market-tools";
import { listingState } from "../lib/listing-tools";
import { money, capitalize } from "../lib/format";
import PickupDirections from "./pickup-directions";
import { MoneyInput, Account, ImageModeration, ReplaceImage, ServiceStatus } from "./account";
import { EditProduct, Restock, ReviewForm, Reviews, BusinessProfile, SellerApprovals, SalesReport } from "./growth";
import { Checkout, Schedule, ReceiptReady, orderLabel, CardPaymentStatus } from "./checkout";
import { useEffect, useRef, useState } from "react";
import { Leaf, MapPin, Search, ArrowUpRight, ArrowRight, ShoppingBag, Store, ShieldCheck, Plus, X, Clock, Check, Upload, Navigation, Minus, Package, RefreshCw, SlidersHorizontal, Heart, Map, LayoutGrid } from "lucide-react";
const requestKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), v => v.toString(16).padStart(2, "0")).join("");
const cats = ["Barchasi", "Non va pishiriqlar", "Tayyor taomlar", "Meva va sabzavot", "Sut mahsulotlari", "Boshqa"];
const time = v => new Date(v).toLocaleString("uz-UZ", {
  timeZone: "Asia/Tashkent",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
async function api(body, params = "") {
  const r = await fetch("/api/data" + params, body ? {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  } : {});
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Xatolik yuz berdi");
  return d;
}
export default function Home({
  initialView = "market",
  initialProducts = []
}) {
  const [data, D] = useState({
      products: initialProducts,
      orders: [],
      favorites: [],
      reviews: [],
      sellers: [],
      report: null,
      me: null
    }),
    [page, Page] = useState(1),
    [city, City] = useState("Toshkent"),
    [display, Display] = useState("grid"),
    [locating, Locating] = useState(false),
    [maxPrice, MP] = useState(""),
    [soon, SO] = useState(false),
    [favoritesOnly, FO] = useState(false),
    [verifiedOnly, VO] = useState(false),
    [orderStatus, OS] = useState("all"),
    [requestedView, V] = useState(initialView === "market" ? null : initialView),
    [cat, C] = useState("Barchasi"),
    [query, Q] = useState(""),
    [sort, S] = useState("new"),
    [modal, M] = useState(null),
    [qty, N] = useState(1),
    [toast, T] = useState(""),
    [busy, B] = useState(false),
    [loading, L] = useState(true),
    [error, E] = useState(""),
    [loc, LOC] = useState(null),
    [draftKey, DK] = useState(0);
  const view = allowedView(data.me?.role, requestedView),
    selling = canSell(data.me?.role);
  const {
      lang
    } = useLanguage(),
    tr = (u, r) => lang === 'ru' ? r : u;
  const [panelTab, PanelTab] = useState("overview");
  const [cart, Cart] = useState([]),
    [orderSearch, OrderSearch] = useState(''),
    [pickupFilter, PickupFilter] = useState('any'),
    [diet, Diet] = useState('any');
  useEffect(() => {
    try {
      Cart(JSON.parse(localStorage.getItem('teja-cart') || '[]'));
    } catch {}
  }, []);
  function setCart(next) {
    Cart(next);
    localStorage.setItem('teja-cart', JSON.stringify(next));
  }
  function addToCart(p, n) {
    if (cart.length && cart[0].owner !== p.owner) {
      T(tr('Savatda boshqa do‘kon mahsulotlari bor. Avval savatni yakunlang yoki tozalang.', 'В корзине товары другого магазина. Завершите заказ или очистите корзину.'));
      return;
    }
    const old = cart.find(x => x.id === p.id);
    const count = (old?.qty || 0) + n;
    if (count > p.stock) {
      T(tr('Qoldiq yetarli emas', 'Недостаточно товара'));
      return;
    }
    setCart(old ? cart.map(x => x.id === p.id ? {
      ...x,
      qty: count
    } : x) : [...cart, {
      ...p,
      qty: n
    }]);
    T(tr('Savatga qo‘shildi', 'Добавлено в корзину'));
    M(null);
  }
  const key = useRef(null);
  const latestRefresh = useRef(null);
  useEffect(() => {
    latestRefresh.current = refresh;
  });
  useEffect(() => {
    const timer = setTimeout(() => refresh(), 250);
    return () => clearTimeout(timer);
  }, [query, city, cat, sort, maxPrice, page, view]);
  useEffect(() => {
    if (!modal) return;
    const before = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const focusable = () => [...dialog.querySelectorAll("button:not(:disabled),a[href],input:not(:disabled),select,textarea")].filter(e => e.getClientRects().length);
    focusable()[0]?.focus();
    function handle(e) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        if (!modal.studio || confirm("Oynani yopish / Закрыть?")) M(null);
      }
      if (e.key === "Tab") {
        const a = focusable(),
          first = a[0],
          last = a.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      before?.focus();
    };
  }, [modal, busy]);
  async function refresh() {
    try {
      const params = new URLSearchParams({
        catalog: ["market", "map"].includes(view) ? "1" : "0",
        includeSoldOut: "1",
        page: String(page),
        q: query,
        city,
        sort,
        maxPrice,
        category: cat === "Barchasi" ? "" : cat
      });
      D(await api(null, "?" + params));
      E("");
    } catch (e) {
      E(e.message);
    } finally {
      L(false);
    }
  }
  useEffect(() => {
    const v = new URLSearchParams(location.search).get("view");
    queueMicrotask(() => {
      if (["orders", "seller", "account", "map"].includes(v)) V(v);
      refresh();
    });
    let version = 0;
    const timer = setInterval(async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/changes?since=" + version);
        const c = await r.json();
        if (c.changed) {
          version = c.version;
          await latestRefresh.current?.();
        }
      } catch {}
    }, 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => T(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  async function action(body, msg) {
    B(true);
    try {
      const out = await api(body);
      await refresh();
      T(out.message || msg);
      if (body.items && out.ok) setCart([]);
      if (out.receiptReady) {
        M({
          receiptId: out.id
        });
        return;
      }
      if (out.redirect) {
        location.assign(out.redirect);
        return;
      } else if (out.cardPayment) {
        if (out.cardPayment === "paid") M({
          receiptId: out.id
        });else {
          M(null);
          V("orders");
        }
      } else if (body.action === "schedule") {
        M({
          receiptId: body.id
        });
      } else if (!["favorite", "moderateReview"].includes(body.action)) M(null);
    } catch (e) {
      T(e.message);
      await refresh();
    } finally {
      B(false);
    }
  }
  const openCreate = () => {
    if (!data.me) {
      location.href = "/login";
      return;
    }
    if (!selling) {
      T("Mahsulot joylash faqat sotuvchi hisobi uchun");
      return;
    }
    M({
      studio: true
    });
  };
  function locate() {
    V("map");
    if (!navigator.geolocation) {
      T("Brauzer joylashuvni qo‘llamaydi. Xaritani qo‘lda siljiting.");
      return;
    }
    Locating(true);
    navigator.geolocation.getCurrentPosition(p => {
      LOC({
        lat: p.coords.latitude,
        lng: p.coords.longitude
      });
      S("near");
      Locating(false);
      T("Yaqin mahsulotlar xaritada ko‘rsatilmoqda");
    }, () => {
      Locating(false);
      T("Joylashuv aniqlanmadi. Ruxsat bering yoki xaritani qo‘lda siljiting.");
    }, {
      timeout: 12000,
      maximumAge: 60000,
      enableHighAccuracy: true
    });
  }
  const distance = p => loc ? distanceKm(loc, p) : 0;
  let products = data.products.filter(p => p.active && p.stock >= 0 && (pickupFilter !== "evening" || new Date(p.until).toLocaleString("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    hourCycle: "h23"
  }) >= "18") && (pickupFilter !== "now" || p.until > Date.now() + 1800000) && (diet === "any" || (diet === "vegetarian" ? /vegetarian|vegetar|вегетариан/i.test(p.allergens) : diet === "milk" ? /sutsiz|без молока/i.test(p.allergens) : /yong‘oqsiz|yongoqsiz|без орехов/i.test(p.allergens))) && p.until > Date.now() && (!maxPrice || p.price <= Number(maxPrice)) && (!soon || p.until <= Date.now() + 7200000) && (!favoritesOnly || data.favorites.includes(p.id)) && (!verifiedOnly || p.seller_verified) && (cat === "Barchasi" || p.category === cat) && `${p.title} ${p.shop} ${p.address}`.toLowerCase().includes(query.toLowerCase()));
  products.sort((a, b) => sort === "ending" ? a.until - b.until : sort === "price" ? a.price - b.price : sort === "discount" ? 1 - b.price / b.original - (1 - a.price / a.original) : sort === "near" ? distance(a) - distance(b) : b.created - a.created);
  const mine = data.products.filter(p => p.owner === data.me?.id),
    orders = data.orders.filter(o => orderStatus === "all" || o.status === orderStatus).filter(o => `${o.title} ${o.shop} ${o.receipt_no || ""} ${o.id}`.toLowerCase().includes(orderSearch.toLowerCase())).filter(o => view === "seller" ? o.owner === data.me?.id : view === "orders" ? data.me?.role === "admin" ? true : selling ? o.owner === data.me?.id : o.buyer === data.me?.id : true);
  const sharedOpened = useRef(false);
  useEffect(() => {
    if (loading || sharedOpened.current) return;
    const id = new URLSearchParams(location.search).get("product");
    if (!id) return;
    sharedOpened.current = true;
    const p = data.products.find(p => p.id === id && p.active && p.stock > 0 && p.until > Date.now());
    queueMicrotask(async () => {
      try {
        const product = p || (await fetch("/api/product?id=" + encodeURIComponent(id)).then(r => r.json()).then(d => d.product));
        if (!product) throw Error("Topilmadi");
        M(product);
        N(1);
        key.current = requestKey();
      } catch {
        T("Bu taklif tugagan yoki hozir mavjud emas");
      }
    });
  }, [loading, data.products]);
  const totals = data.orders.filter(o => o.status === "collected" && o.provider !== "demo" && o.is_mock !== 1 && (view === "admin" || o.owner === data.me?.id));
  function orderCard(o) {
    return <article className="order" key={o.id}>
        <img src={o.image} alt="" />
        <div className="order-main">
          <span className={"status " + o.status}><Translated>{orderLabel(o)}</Translated></span><small>#{o.id.slice(0, 8)} · {time(o.created)}</small>
          <h3>{o.title}</h3>{o.items?.length > 0 && <ul className="order-items">{o.items.map(i => <li key={i.id}>{i.title} × {i.qty} <b>{money(i.price * i.qty)}</b></li>)}</ul>}
          <p>
            {o.shop} · {o.qty}<Translated>{"dona \xB7"}</Translated>{money(o.qty * o.price)}
          </p>
          <small>
            <Clock size={13} /> {time(o.pickup_at || o.until)}<Translated>{"gacha"}</Translated></small>
          <p className="muted">{o.address}</p>
          {o.buyerPhone && <p>
              <Link href={"tel:" + o.buyerPhone}>{o.buyerPhone}</Link>{" "}
              <button onClick={() => navigator.clipboard.writeText(o.buyerPhone)}><Translated>{"Nusxa / \u041A\u043E\u043F\u0438\u0440\u043E\u0432\u0430\u0442\u044C"}</Translated></button>
            </p>}
          {o.receipt_no && <div className="order-receipt">
              <b><Translated>{"Chek \u2116"}</Translated>{o.provider === "demo" || o.is_mock === 1 ? "SINOV-" : ""}
                {o.receipt_no}
              </b>
              <small>
                {o.provider === "cash" ? (o.payment_state === "cash_due" ? (["expired","cancelled"].includes(o.status)?"Bron bekor qilingan — pul olinmagan":"Do‘konda to‘liq naqd to‘lov") : o.payment_state === "cash_paid" ? "Naqd qabul qilingan" : "Naqd buyurtma") : o.provider === "demo" || o.is_mock === 1 ? "SINOV — pul olinmagan" : "10% to‘lov qayd etilgan"}{" "}
                · {money(o.provider === "cash" ? o.price*o.qty : o.deposit)}
              </small>
              <Link className="text-link" target="_blank" rel="noreferrer" href={"/api/receipt?id=" + encodeURIComponent(o.id)}><Translated>{"Chekni ochish / PDF \u2197"}</Translated></Link>
              {o.buyer === data.me?.id && o.status === "reserved" && !o.pickup_selected && <button className="secondary" onClick={() => M({
            schedule: o
          })}>
                    <Translated>Olib ketish vaqtini tanlash</Translated>
                  </button>}
              {o.status === "expired" && <small className="error"><Translated>{"Olib ketish muddati o\u2018tdi."}</Translated>{" "}
                  {o.provider === "cash" ? "Naqd to‘lov olinmagan." : o.provider === "demo" || o.is_mock === 1 ? "Sinovda pul ushlanmaydi." : "10% shart bo‘yicha qaytarilmaydi."}
                </small>}
              {o.payment_state.includes("refund_due") && <small><Translated>{"Qaytarish kutilmoqda"}</Translated>{o.provider === "demo" || o.is_mock === 1 ? " (sinov)" : ""}
                </small>}
            </div>}
          {o.provider === "card" && o.status === "pending_payment" && (o.buyer === data.me?.id || data.me?.role === "admin") && <CardPaymentStatus order={o} onUpdate={refresh} />}{" "}
          {o.code && o.status === "reserved" && <div className="pickup">
              <PickupQR order={o} /><Translated>Olib ketish kodi</Translated> <b>{o.code}</b>
              <small>
                {o.payment_state === "legacy" ? "To‘lov mahsulotni olib ketishda" : "Sotuvchiga: " + money(o.qty * o.price - o.deposit)}
              </small>
            </div>}
          {o.buyer === data.me?.id && o.owner !== data.me?.id && o.status === "collected" && o.provider !== "demo" && !data.reviews.some(r => r.order_id === o.id) && <button className="secondary" onClick={() => M({
          review: o
        })}><Translated>{"\u2605 Baho berish"}</Translated></button>}
          {o.payment_state==='refunded'&&<p>{tr('Pul qaytarilgan','Деньги возвращены')}</p>}
          {o.buyer===data.me?.id&&<button className="secondary" disabled={busy} onClick={async()=>{B(true);try{const d=await api({action:'reorderPreview',id:o.id});M({reorder:d});}catch(e){T(e.message);}finally{B(false);}}}>{tr('Yana buyurtma qilish','Повторить заказ')}</button>}
          <PickupDirections place={o} compact />
        </div>
        {o.status === "reserved" && <div className="order-actions">
            {(selling || view === "admin") && <button disabled={busy} onClick={() => M({
          collect: o
        })}>
                <Translated>Topshirish</Translated>
              </button>}
            <button className="secondary" disabled={busy} onClick={() => M({
          cancel: o
        })}>
              <Translated>Bekor qilish</Translated>
            </button>
          </div>}
      </article>;
  }
  return <>
      <header>
        <Link href="/" className="brand">
          <span>
            <Leaf size={23} />
          </span>
          teja<span className="brand-dot">.</span>
        </Link>
        <nav>
          <button className={view === "market" ? "selected" : ""} onClick={() => {
          V("market");
          Display("grid");
        }}>
            <Translated>Takliflar</Translated>
          </button>
          {!selling && data.me?.role !== "admin" && <button className={view === 'map' ? 'selected' : ''} onClick={() => V('map')}><Translated>Xaritadan izlash</Translated></button>}
          <button className={view === "orders" ? "selected" : ""} onClick={() => {if(selling||data.me?.role==="admin"){V(data.me.role==="admin"?"admin":"seller");PanelTab("orders");}else V("orders");}}>
            <Translated>Buyurtmalarim</Translated>{" "}
            {data.orders.filter(o => (data.me?.role === "admin" || (selling ? o.owner === data.me?.id : o.buyer === data.me?.id)) && o.status === "reserved").length > 0 && <i className="count">
                {data.orders.filter(o => (data.me?.role === "admin" || (selling ? o.owner === data.me?.id : o.buyer === data.me?.id)) && o.status === "reserved").length}
              </i>}
          </button>
          {selling && <button className={view === "seller" ? "selected" : ""} onClick={() => V("seller")}>
              <Translated>Sotuvchi paneli</Translated>
            </button>}
          {data.me?.role === "admin" && <button className={view === "admin" ? "selected" : ""} onClick={() => V("admin")}>
              <Translated>Admin paneli</Translated>
            </button>}
          <button className={view === "account" ? "selected" : ""} onClick={() => V("account")}>
            <Translated>Hisobim</Translated>
          </button>
        </nav>
        <div className="header-right"><LanguageSwitcher /><ThemeSwitcher />{["market","map"].includes(view)&&<button className="icon-button cart-trigger" aria-label={tr('Savat', 'Корзина')} onClick={() => {
          key.current = requestKey();
          M({
            cart: true
          });
        }}><ShoppingBag size={20} />{cart.length > 0 && <i className="count">{cart.reduce((s, p) => s + p.qty, 0)}</i>}</button>}
          <label className="city">
            <MapPin size={15} />
            <select aria-label="Shahar / Город" value={city} onChange={e => {
            City(e.target.value);
            Page(1);
          }}>
              {["Toshkent", "Samarqand", "Buxoro", "Andijon", "Namangan", "Farg‘ona", "Nukus", "Qarshi", "Termiz"].map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
          {data.me ? <button className="avatar" title={data.me.name} aria-label="Hisobimni ochish" onClick={() => V("account")}>
              {data.me.avatar ? <img src={data.me.avatar} alt="" /> : data.me.name[0].toUpperCase()}
            </button> : <Link className="login" href="/login" target="_top">
              <Translated>Kirish</Translated>
              <ArrowUpRight size={15} />
            </Link>}
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Mobil menyu">
        {[["market", "Takliflar", ShoppingBag], ["map", "Xaritadan izlash", Map], ["orders", "Buyurtmalar", Package], [data.me?.role === "admin" ? "admin" : "seller", data.me?.role === "admin" ? "Admin" : "Sotish", Store], ["account", "Hisobim", ShieldCheck]].filter(([id]) => (id !== "seller" || selling) && (id !== "map" || !selling && data.me?.role !== "admin")).map(([id, name, Icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => {
        V(id);
        window.scrollTo({
          top: 0,
          behavior: "smooth"
        });
      }}>
              <Icon size={20} />
              <Translated>{name}</Translated>
            </button>)}
      </nav>
      <main>
        {data.demo && data.me?.role === "admin" && <div className="demo-banner" role="status">
            SINOV TO‘LOVI · Haqiqiy pul yechilmaydi
            tekshirilmaydi
          </div>}
        {view === "account" ? <Account me={data.me} onUpdate={refresh} /> : view === "map" ? <DiscoveryMap products={products} location={loc} onLocate={locate} locating={locating} onOpen={p => {
        M(p);
        N(1);
        key.current = requestKey();
      }} /> : view === "market" ? <>
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> {tr("YAXSHI OVQAT. YAXSHI ODAT.", "ХОРОШАЯ ЕДА. ПОЛЕЗНАЯ ПРИВЫЧКА.")}
                </div>
                <h1>
                  {tr("Mazasi o‘sha.", "Всё так же вкусно.")}
                  <br />
                  {tr("Narxi", "Цена")} <em>{tr("yoqimliroq.", "ещё приятнее.")}</em>
                </h1>
                <p>
                  {tr("Yaqiningizdagi ortiqcha mahsulotlarni chegirmada oling.", "Покупайте оставшиеся продукты рядом со скидкой.")}
                  <br className="desktop" /> {tr("Pulni tejang. Yaxshi ovqatni isrofdan asrang.", "Экономьте и помогайте хорошей еде не пропасть.")}
                </p>
                <div className="hero-buttons">
                  <button onClick={() => document.getElementById("offers").scrollIntoView({
                behavior: "smooth"
              })}>
                    <Translated>Takliflarni ko‘rish</Translated>
                    <ArrowRight size={18} />
                  </button>
                  {selling && <button className="ghost" onClick={openCreate}>
                      <Translated>Mahsulot joylash</Translated>
                      <Plus size={18} />
                    </button>}
                </div>
                <div className="hero-note">
                  <ShieldCheck size={18} />
                  <span><Translated>{"10% oldindan \xB7 90% olib ketishda \xB7 Belgilangan vaqtda"}</Translated></span>
                </div>
              </div>
              <div className="hero-photo">
                <img src="/hero.svg" alt="Yangi pishirilgan non va pishiriqlar" />
                <span className="photo-shade" />
                <div className="photo-label">
                  <span><Translated>{"HAR BIR MAHSULOT QADRLI"}</Translated></span>
                  <h2><Translated>{"Yaxshilikning"}</Translated><br /><Translated>{"mazasi boshqacha."}</Translated></h2>
                </div>
                <div className="round-stamp">
                  <Leaf size={24} />
                  <span><Translated>{"Kamroq isrof"}</Translated><br /><Translated>{"Ko\u2018proq foyda"}</Translated></span>
                </div>
              </div>
            </section>
            <div className="benefits">
              <span>
                <ShoppingBag size={20} />
                <b>
                  <Translated>Tejamkor xarid</Translated>
                </b>
                <small>
                  <Translated>Chegirmali kundalik mahsulotlar</Translated>
                </small>
              </span>
              <span>
                <MapPin size={20} />
                <b>
                  <Translated>Mahallangizdan toping</Translated>
                </b>
                <small>
                  <Translated>Manzil va olib ketish vaqti aniq</Translated>
                </small>
              </span>
              <span>
                <Leaf size={20} />
                <b>
                  <Translated>Birga isrofni kamaytiramiz</Translated>
                </b>
                <small>
                  <Translated>Har bir xarid — kichik yaxshi qadam</Translated>
                </small>
              </span>
            </div>
            <section id="offers">
              <div className="section-head">
                <div>
                  <div className="eyebrow"><Translated>{"BUGUNGI YAXSHI IMKONIYATLAR"}</Translated></div>
                  <h2>
                    <Translated>Siz uchun yangi takliflar</Translated>
                    <span className="number">{products.length}</span>
                  </h2>
                </div>
                <button className="near secondary" disabled={locating} onClick={locate}>
                  <Navigation size={16} />
                  <Translated>Yaqinimdagilar</Translated>
                </button>
              </div>
              <div className="tools">
                <div className="search">
                  <Search size={19} />
                  <input aria-label="Mahsulot izlash" placeholder={tr("Mahsulot, do‘kon yoki manzilni izlang…", "Товар, магазин или адрес…")} value={query} onChange={e => {
                Q(e.target.value);
                Page(1);
              }} />
                </div>
                <select aria-label="Saralash" value={sort} onChange={e => S(e.target.value)}>
                  <option value="new">
                    <Translated>Eng yangi takliflar</Translated>
                  </option>
                  <option value="ending">
                    <Translated>Avval muddati yaqinlari</Translated>
                  </option>
                  <option value="price">
                    <Translated>Avval arzonlari</Translated>
                  </option>
                  <option value="discount">
                    <Translated>Eng katta chegirma</Translated>
                  </option>
                  {loc && <option value="near">
                      <Translated>Eng yaqinlari</Translated>
                    </option>}
                </select>
              </div>
              <MarketFilters maxPrice={maxPrice} onMaxPrice={MP} soon={soon} onSoon={SO} />
              <div className="practical-filters"><label>{tr('Qachon olasiz?', 'Когда заберёте?')}<select value={pickupFilter} onChange={e => PickupFilter(e.target.value)}><option value="any">{tr('Istalgan vaqt', 'Любое время')}</option><option value="now">{tr('Hozir olaman', 'Заберу сейчас')}</option><option value="evening">{tr('18:00 dan keyin', 'После 18:00')}</option></select></label><details className="advanced-filters"><summary>{tr('Qo‘shimcha filtrlar','Дополнительные фильтры')}</summary><label>{tr('Tarkibi', 'Состав')}<select value={diet} onChange={e => Diet(e.target.value)}><option value="any">{tr('Barchasi', 'Все')}</option><option value="vegetarian">Vegetarian</option><option value="milk">{tr('Sutsiz deb belgilangan', 'Отмечено «без молока»')}</option><option value="nuts">{tr('Yong‘oqsiz deb belgilangan', 'Отмечено «без орехов»')}</option></select></label><small>{tr('Tarkib sotuvchi ma’lumoti bo‘yicha. Allergiya bo‘lsa, sotuvchidan aniqlashtiring.', 'Состав указан продавцом. При аллергии уточняйте у магазина.')}</small></details></div>
              <div className="quick-filters">
                <button className={favoritesOnly ? "active" : ""} onClick={() => FO(!favoritesOnly)}>
                  ♡ {tr("Sevimlilar", "Избранное")} ({data.favorites.length})
                </button>
                <button className={verifiedOnly ? "active" : ""} onClick={() => VO(!verifiedOnly)}>
                  ✓ {tr("Tasdiqlangan sotuvchilar", "Проверенные продавцы")}
                </button>
              </div>
              <div className="categories">
                {cats.map((c, i) => <button key={c} onClick={() => C(c)} className={cat === c ? "active" : ""}>
                    {["✦", "🥐", "🍲", "🥬", "🥛", "⋯"][i]} {lang === "ru" ? ["Все", "Хлеб и выпечка", "Готовая еда", "Фрукты и овощи", "Молочные продукты", "Другое"][i] : c}
                  </button>)}
              </div>
              {loading ? <div className="empty">
                  <RefreshCw className="spin" /><Translated>{"Takliflar yuklanmoqda\u2026"}</Translated></div> : display === "map" ? <DiscoveryMap products={products} location={loc} onLocate={locate} locating={locating} onOpen={p => {
            M(p);
            N(1);
            key.current = requestKey();
          }} /> : products.length ? <div className="grid">
                  {products.map(p => <article className="product" key={p.id}>
                      <div className="product-image">
                        <img src={p.image} alt={p.title} />
                        <span className="discount">
                          −{Math.round((1 - p.price / p.original) * 100)}%
                        </span>
                        <span className="stock">{p.stock}<Translated>{"dona qoldi"}</Translated></span>
                        <button className={"favorite-button " + (data.favorites.includes(p.id) ? "saved" : "")} aria-label={data.favorites.includes(p.id) ? "Sevimlilardan olib tashlash" : "Sevimlilarga saqlash"} aria-pressed={data.favorites.includes(p.id)} disabled={busy} onClick={() => data.me ? action({
                  action: "favorite",
                  id: p.id,
                  saved: !data.favorites.includes(p.id)
                }, data.favorites.includes(p.id) ? "Sevimlilardan olindi" : "Sevimlilarga saqlandi") : T("Saqlash uchun hisobingizga kiring")}>
                          <Heart size={19} />
                        </button>
                      </div>
                      <div className="product-body">
                        <small className="shop">
                          <Store size={13} />
                          {p.shop}
                          {p.seller_verified === 1 && <span className="verified-badge" title="TEJA admini tasdiqlagan">
                              ✓
                            </span>}
                          {loc && ` · ${distance(p).toFixed(1)} km`}
                        </small>
                        <h3>{p.title}</h3>
                        <button className="rating-link" onClick={() => M({
                  reviews: p
                })}>
                          ★ {p.rating || "—"} · {p.review_count}<Translated>{"ta baho"}</Translated></button>
                        <div className="product-address">
                          <MapPin size={13} />
                          {p.address}
                        </div>
                        <div className="time">
                          <Clock size={14} />
                          {time(p.until)}<Translated>{"gacha olib keting"}</Translated></div>
                        <div className="product-bottom">
                          <div>
                            <del>{money(p.original)}</del>
                            <strong>{money(p.price)}</strong>
                          </div>
                          <button aria-label={p.title + " band qilish"} onClick={() => {
                    M(p);
                    N(1);
                    key.current = requestKey();
                  }}>
                            <Plus size={22} />
                          </button>
                        </div>
                      </div>
                    </article>)}
                </div> : <div className="empty">
                  <div className="empty-icon">
                    <ShoppingBag size={32} />
                  </div>
                  <h3>
                    {query || cat !== "Barchasi" || favoritesOnly || verifiedOnly || maxPrice || soon ? "Mos taklif topilmadi" : "Hozircha faol taklif yo‘q"}
                  </h3>
                  <p>
                    {query || cat !== "Barchasi" || favoritesOnly || verifiedOnly || maxPrice || soon ? "Boshqa so‘z yoki toifani tanlang." : "Yangi mahsulotlar qo‘shilganda shu yerda ko‘rinadi."}
                  </p>
                  {selling && <button onClick={openCreate}>
                      <Translated>Mahsulot joylash</Translated>
                      <Plus size={17} />
                    </button>}
                </div>}
              <nav aria-label="Sahifalar / Страницы">
                <button disabled={page <= 1} onClick={() => Page(page - 1)}>
                  ←
                </button>
                <span>
                  {" "}
                  {page} / {data.pagination?.pages || 1}{" "}
                </span>
                <button disabled={page >= (data.pagination?.pages || 1)} onClick={() => Page(page + 1)}>
                  →
                </button>
              </nav>
            </section>
            {selling && <section className="seller-banner">
                <div className="banner-icon">
                  <Store size={36} />
                </div>
                <div>
                  <small><Translated>{"BIZNESINGIZ UCHUN HAM FOYDALI"}</Translated></small>
                  <h2><Translated>{"Ortiqcha mahsulot. Qo\u2018shimcha daromad."}</Translated></h2>
                  <p><Translated>{"Rasm yuklang, narxni belgilang va yaqin xaridorlarni toping."}</Translated></p>
                </div>
                <button onClick={openCreate}>
                  <Translated>Sotishni boshlash</Translated>
                  <ArrowUpRight size={18} />
                </button>
              </section>}
          </> : <section className="dashboard">
            <div className="section-head">
              <div>
                <div className="eyebrow">
                  TEJA /{" "}
                  {view === "orders" ? (selling ? "SOTUVCHI" : "XARIDOR") : view === "seller" ? "SOTUVCHI" : "BOSHQARUV"}
                </div>
                <h1>
                  {view === "orders" ? tr("Buyurtmalarim", "Мои заказы") : view === "seller" ? tr("Sotuvchi paneli", "Панель продавца") : tr("Admin paneli", "Панель администратора")}
                </h1>
                <p className="muted">
                  {view === "orders" ? tr("Band qilgan mahsulotlaringiz va olib ketish kodlari.","Ваши заказы и коды получения.") : tr("Mahsulotlar, qoldiq va buyurtmalar bir joyda.","Товары, остатки и заказы в одном месте.")}
                </p>
              </div>
              {view === "seller" && <button onClick={openCreate}>
                  <Plus size={17} />
                  <Translated>Mahsulot qo‘shish</Translated>
                </button>}
            </div>
            {!data.me ? <div className="empty">
                <ShieldCheck size={36} />
                <h3>
                  <Translated>Hisobingizga kiring</Translated>
                </h3>
                <p><Translated>{"Buyurtma va mahsulotlar hisobingizda saqlanadi."}</Translated></p>
                <Link className="login" href="/login" target="_top">
                  <Translated>Telefon orqali kirish</Translated>
                </Link>
              </div> : <>
                {view !== "orders" && <>
                  <PanelNav admin={view === "admin"} tab={panelTab} onChange={PanelTab} orders={data.orders.filter(o => view === "admin" || o.owner === data.me.id)} products={view === "admin" ? data.products : mine}/>
                  {panelTab === "overview" && <PanelOverview admin={view === "admin"} products={view === "admin" ? data.products : mine} orders={data.orders.filter(o => view === "admin" || o.owner === data.me.id)} onTab={PanelTab}/>}
                  {panelTab === "finance" && <><SalesReport report={data.report}/><div className="panel-card"><h3>{tr('Qaytarish kutilmoqda','Ожидает возврата')}</h3><strong>{money(data.orders.filter(o => ["refund_due","cash_refund_due"].includes(o.payment_state) && (view === "admin" || o.owner === data.me.id)).reduce((n,o)=>n+(o.provider==="cash"?o.price*o.qty:o.deposit),0))}</strong><p>{tr('Bu summa hali qaytarildi degani emas. Holat to‘lov qaytarilgandan keyin yangilanadi.','Эта сумма ещё не возвращена. Статус обновляется после возврата.')}</p></div></>}
                  {panelTab === "partners" && <PartnersPanel admin={view === "admin"} onUpdate={refresh}/>}
                  {panelTab === "activity" && <StockActivity/>}
                  {panelTab === "users" && view === "admin" && <UsersDirectory/>}
                  {panelTab === "settings" && (view === "admin" ? <ServiceStatus/> : <BusinessProfile me={data.me} busy={busy} onSave={(name,contact)=>action({action:"requestVerification",name,contact},"Ariza adminga yuborildi")}/>)}
                  {panelTab === "moderation" && view === "admin" && <><ImageModeration products={data.products} busy={busy} onDecide={(id,approved)=>action({action:"reviewImage",id,approved},"Rasm tekshirildi")}/><AdminQueues/></>}
                  {panelTab === "sellers" && view === "admin" && <SellerApprovals sellers={data.sellers} busy={busy} onReview={(id,approved)=>action({action:"verifySeller",id,approved},"Sotuvchi holati yangilandi")}/>}
                  {panelTab === "inventory" && <>
                    {selling && <>{data.me.selling_paused===1&&<p className="wallet-notice">Yangi savdo vaqtincha cheklangan. Mavjud buyurtmalarni topshirishingiz mumkin.</p>}<DailyListing products={mine} busy={busy} onSave={values=>action({action:"quickDay",...values,requestId:requestKey()},"Bugungi taklif tayyor")}/><DraftShelf refreshKey={draftKey} onOpen={draft=>M({studio:true,draft})}/></>}
                    <SellerInventory products={view === "admin" ? data.products : mine} me={data.me} busy={busy} onEdit={p => M({
              edit: p
            })} onRestock={p => {
              key.current = requestKey();
              M({
                restock: p
              });
            }} onImage={p => M({
              replaceImage: p
            })} onReviews={p => M({
              reviews: p
            })} onToggle={p => action({
              action: "toggle",
              id: p.id
            }, "Mahsulot holati yangilandi")} onCopy={p => M({
              studio: true,
              copy: p
            })} />
                  </>}
                </>}
                {(view === "orders" || panelTab === "orders") && <>
                <div className="section-head">
                  <h2>
                    {view === "orders" ? tr("Buyurtmalar tarixi", "История заказов") : tr("Buyurtmalar", "Заказы")}
                  </h2>
                  <button className="secondary" onClick={refresh}>
                    <RefreshCw size={15} />
                    <Translated>Yangilash</Translated>
                  </button>
                </div>
                <div className="order-filter"><label>{tr('Buyurtma yoki chekni izlash', 'Найти заказ или чек')}<input value={orderSearch} onChange={e => OrderSearch(e.target.value)} placeholder={tr('Mahsulot, do‘kon, chek raqami', 'Товар, магазин, номер чека')} /></label>
                  <label><Translated>{"Buyurtma holati"}</Translated><select value={orderStatus} onChange={e => OS(e.target.value)}>
                      <option value="all">
                        <Translated>Barchasi</Translated>
                      </option>
                      <option value="pending_payment">
                        <Translated>To‘lov kutilmoqda</Translated>
                      </option>
                      <option value="payment_expired">
                        <Translated>To‘lov muddati tugagan</Translated>
                      </option>
                      <option value="reserved">
                        <Translated>Band qilingan</Translated>
                      </option>
                      <option value="collected">
                        <Translated>Topshirilgan</Translated>
                      </option>
                      <option value="cancelled">
                        <Translated>Bekor qilingan</Translated>
                      </option>
                      <option value="expired">
                        <Translated>Vaqti o‘tgan</Translated>
                      </option>
                    </select>
                  </label>
                </div>
                {orders.length ? orders.map(orderCard) : <div className="empty">
                    <Package size={32} />
                    <h3>
                      <Translated>Hozircha buyurtma yo‘q</Translated>
                    </h3>
                    <p><Translated>{"Yangi buyurtmalar shu yerda ko\u2018rinadi."}</Translated></p>
                    <button onClick={() => {
              V("market");
              Display("grid");
            }}>
                      <Translated>Takliflarni ko‘rish</Translated>
                    </button>
                  </div>}
                </>}
              </>}
          </section>}
        {error && <div className="error-box">
            {error}{" "}
            <button onClick={refresh}>
              <Translated>Qayta urinish</Translated>
            </button>
          </div>}
      </main>
      <footer>
        <Link className="brand" href="/">
          <Leaf /> teja.
        </Link>
        <span><Translated>{"Ovqatni qadrlaymiz. Birga tejaymiz."}</Translated></span>
        <small>TEJA · 2026</small>
        <nav>
          {["offer", "terms", "privacy", "refunds", "help", "how", "faq"].map(slug => <Link key={slug} href={"/legal/" + slug}>
                {{
            offer: "Ommaviy oferta",
            terms: "Shartlar",
            privacy: "Maxfiylik",
            refunds: "Qaytarish",
            help: "Yordam",
            how: "Qanday ishlaydi",
            faq: "Savollar"
          }[slug]}
              </Link>)}
        </nav>
      </footer>
      {toast && <div role="status" className="toast">
          <Check size={19} />
          {toast}
          <button onClick={() => T("")} aria-label="Yopish">
            <X size={16} />
          </button>
        </div>}
      {modal && <div className="overlay" onClick={e => {
      if (e.target === e.currentTarget && !busy && !modal.studio) M(null);
    }}>
          <div className={"modal " + (modal.studio ? "wide" : "")} role="dialog" aria-modal="true" aria-label="TEJA amal oynasi">
            <button className="close" disabled={busy} onClick={() => {
          if (!modal.studio || confirm("Saqlanmagan o‘zgarishlar qolishi mumkin. Oynani yopasizmi?")) {
            M(null);
            DK(k => k + 1);
          }
        }} aria-label="Yopish">
              <X />
            </button>
            {modal.reorder ? <><h2>{tr('Buyurtmani takrorlash','Повтор заказа')}</h2><p>{tr('Hozirgi narx va mavjud qoldiq bo‘yicha tekshirildi.','Проверены текущие цены и остатки.')}</p>{modal.reorder.changes.map((c,i)=><p key={i}>{c}</p>)}{modal.reorder.items.map(p=><p key={p.id}>{p.title} × {p.qty} — <b>{money(p.price*p.qty)}</b></p>)}{!!cart.length&&<p>{tr('Tasdiqlasangiz, joriy savat shu mahsulotlar bilan almashtiriladi.','После подтверждения текущая корзина будет заменена этими товарами.')}</p>}<button className="full" disabled={!modal.reorder.items.length} onClick={()=>{setCart(modal.reorder.items);key.current=requestKey();M({cart:true});}}>{tr('Savatga olish','Добавить в корзину')}</button></> : modal.cart ? <CartPanel items={cart} setItems={setCart} me={data.me} busy={busy} onCheckout={(type, provider, acceptTerms, cardId) => action({
          action: type,
          provider,
          acceptTerms,
          cardId,
          items: cart.map(p => ({
            id: p.id,
            qty: p.qty
          })),
          requestId: key.current
        }, tr('Buyurtma ochilmoqda', 'Создаём заказ'))} /> : modal.studio ? <ListingStudio key={modal.draft?.id || modal.copy?.id || "new"} draft={modal.draft} copy={modal.copy} defaults={mine[0] ? {
          shop: mine[0].shop,
          address: mine[0].address,
          lat: mine[0].lat,
          lng: mine[0].lng
        } : undefined} onBusy={B} onDone={async out => {
          M(null);
          V("seller");
          DK(k => k + 1);
          T(out.message || "Mahsulot joylandi");
          await refresh();
        }} /> : modal.replaceImage ? <ReplaceImage product={modal.replaceImage} onSave={image => action({
          action: "replaceImage",
          id: modal.replaceImage.id,
          image
        }, "Rasm yangilandi")} /> : modal.edit ? <EditProduct product={modal.edit} busy={busy} onSave={product => action({
          action: "editProduct",
          id: modal.edit.id,
          product
        }, "Mahsulot yangilandi")} /> : modal.restock ? <Restock product={modal.restock} busy={busy} onSave={qty => action({
          action: "restock",
          id: modal.restock.id,
          qty,
          requestId: key.current
        }, "Qoldiq qo‘shildi")} /> : modal.review ? <ReviewForm order={modal.review} busy={busy} onSave={(rating, comment) => action({
          action: "review",
          id: modal.review.id,
          rating,
          comment
        }, "Bahoyingiz saqlandi")} /> : modal.reviews ? <Reviews product={modal.reviews} reviews={data.reviews.filter(r => r.product === modal.reviews.id)} admin={data.me?.role === "admin"} busy={busy} onModerate={(id, hidden) => action({
          action: "moderateReview",
          id,
          hidden
        }, "Baho holati yangilandi")} /> : modal.receiptId ? <ReceiptReady order={data.orders.find(o => o.id === modal.receiptId)} onSchedule={() => M({
          schedule: data.orders.find(o => o.id === modal.receiptId)
        })} /> : modal.schedule ? <Schedule order={modal.schedule} busy={busy} onSave={pickupAt => action({
          action: "schedule",
          id: modal.schedule.id,
          pickupAt
        }, "Olib ketish vaqti belgilandi")} /> : modal.collect ? <>
                <h2>
                  <Translated>Mahsulotni topshirish</Translated>
                </h2>
                <p><Translated>{"Xaridorning buyurtmasidagi 8 belgili kodni kiriting. To\u2018lovni joyida qabul qiling."}</Translated></p>
                <form onSubmit={e => {
            e.preventDefault();
            action({
              action: "collect",
              id: modal.collect.id,
              code: new FormData(e.target).get("code"),
              cashReceived: new FormData(e.target).get("cashReceived")==="on"
            }, "Buyurtma topshirildi");
          }}>
                  <ScanPickup order={modal.collect} onCode={code => {
              document.querySelector('input[name="code"]').value = code;
            }} />
                  <input name="code" required maxLength={8} placeholder="XXXXXXXX" className="code-input" />
                  {modal.collect.provider==="cash"&&<label className="check"><input name="cashReceived" type="checkbox" required/>{tr("To‘liq naqd summani oldim:","Получена вся сумма наличными:")} <b>{money(modal.collect.price*modal.collect.qty)}</b></label>}
                  <button className="full" disabled={busy}>
                    <Translated>Topshirishni tasdiqlash</Translated>
                  </button>
                </form>
              </> : modal.cancel ? <>
                <h2><Translated>{"Buyurtma bekor qilinsinmi?"}</Translated></h2>
                <p>
                  {modal.cancel.qty}<Translated>{"dona mahsulot qoldiqqa qaytariladi. Oldindan to\u2018lov bo\u2018lsa, qaytarish kutilayotgan deb qayd qilinadi; avtomatik qaytarish hali ulanmagan."}</Translated></p>
                <button className="full" disabled={busy} onClick={() => action({
            action: "cancel",
            id: modal.cancel.id
          }, "Buyurtma bekor qilindi. Qoldiq qaytarildi.")}><Translated>{"Ha, bekor qilish"}</Translated></button>
              </> : <>
                <img className="detail-img" src={modal.image} alt={modal.title} />
                <div className="eyebrow">{modal.shop}</div>
                <h2>{modal.title}</h2>
                <Freshness product={modal}/><ShopFollow product={modal} me={data.me} /><ShareProduct product={modal} />
                <Link href={"/p/" + modal.id}><Translated>{"Mahsulot sahifasi / \u0421\u0442\u0440\u0430\u043D\u0438\u0446\u0430 \u0442\u043E\u0432\u0430\u0440\u0430"}</Translated></Link>
                <ReportButton kind="product" target={modal.id} />
                <PickupDirections place={modal} compact />
                <p>
                  <MapPin size={16} /> {modal.address}
                </p>
                <p>
                  <Clock size={16} /> {time(modal.until)}<Translated>{"gacha olib keting"}</Translated></p>
                <div className="detail-info">
                  <b>
                    <Translated>Tarkibi va allergenlar</Translated>
                  </b>
                  <p>{modal.allergens}</p>
                  <b>
                    <Translated>Saqlash</Translated>
                  </b>
                  <p>{modal.storage}</p>
                </div>
                <div className="quantity-row">
                  <div>
                    <small>
                      <Translated>Bir dona</Translated>
                    </small>
                    <strong>{money(modal.price)}</strong>
                  </div>
                  <div className="quantity">
                    <button aria-label="Kamaytirish" onClick={() => N(Math.max(1, qty - 1))}>
                      <Minus size={16} />
                    </button>
                    <input aria-label="Miqdor" type="number" min="1" max={modal.stock} value={qty} onChange={e => N(Number(e.target.value))} />
                    <button aria-label="Ko‘paytirish" onClick={() => N(Math.min(modal.stock, qty + 1))}>
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
                <div className="total">
                  <span>
                    <Translated>Jami</Translated>
                  </span>
                  <b>{money(modal.price * qty)}</b>
                </div>
                <p className="muted">
                  {data.products.find(p => p.id === modal.id)?.stock ?? modal.stock}{" "}<Translated>{"dona mavjud · To‘lov usulini savatda tanlang"}</Translated></p>
                {modal.stock === 0 ? <button className="full" onClick={async () => {
            try {
              const r = await fetch('/api/community', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  action: 'wait',
                  id: modal.id
                })
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              T(tr('Mahsulot bo‘shasa xabar beramiz', 'Сообщим, когда товар появится'));
              M(null);
            } catch (e) {
              T(e.message);
            }
          }}>{tr('Bo‘shasa xabar bering', 'Сообщить о наличии')}</button> : <button className="full" onClick={() => addToCart(modal, qty)}><ShoppingBag size={18} />{tr('Savatga qo‘shish', 'Добавить в корзину')}</button>}

              </>}
          </div>
        </div>}
    </>;
}