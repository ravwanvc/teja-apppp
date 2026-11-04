import Link from "next/link";
import { getMongoDb } from "../../../lib/mongodb.js";
import { notFound } from "next/navigation";
import { money } from "../../../lib/format.js";
import { MIN_CHECKOUT_WINDOW_MS } from "../../../lib/commerce.js";
import { ReportButton } from "../../account-tools";
export const dynamic = "force-dynamic";
async function product(id) {
  return getMongoDb().then((db) =>
    db.collection("products").findOne({
      id,
      active: { $in: [1, true] },
      until: { $gt: Date.now() + MIN_CHECKOUT_WINDOW_MS },
    }),
  );
}
export async function generateMetadata({ params }) {
  const { id } = await params,
    p = await product(id);
  if (!p) return { title: "Topilmadi / Не найдено" };
  const base = process.env.PUBLIC_SITE_URL || "http://localhost:5173";
  const image = new URL(p.image, base).href;
  return {
    title: p.title + " — TEJA",
    description: p.shop + " · " + money(p.price),
    alternates: { canonical: new URL("/p/" + id, base).href },
    openGraph: {
      title: p.title,
      description: money(p.price),
      images: [image],
      type: "website",
    },
    twitter: { card: "summary_large_image", title: p.title, images: [image] },
  };
}
export default async function Product({ params }) {
  const { id } = await params,
    p = await product(id);
  if (!p) notFound();
  const images = [...new Set([p.image, ...JSON.parse(p.images || "[]")])];
  return (
    <main className="dashboard">
      <Link href="/">← TEJA</Link>
      <h1>{p.title}</h1>
      <div className="grid">
        {images.map((src) => (
          <img
            key={src}
            src={src}
            alt={p.title}
            style={{ width: "100%", maxWidth: 450, borderRadius: 16 }}
          />
        ))}
      </div>
      <h2>{money(p.price)}</h2>
      <del>{money(p.original)}</del>
      <p>
        <Link href={"/s/" + p.owner}>{p.shop}</Link> · {p.city}
      </p>
      <p>{p.address}</p>
      <p>{p.allergens}</p>
      <p>{p.storage}</p>
      <p>
        {new Date(p.until).toLocaleString("uz-UZ", {
          timeZone: "Asia/Tashkent",
        })}
      </p>
      <Link className="login" href={"/?product=" + p.id}>
        Xarid qilish / Купить
      </Link>
      <ReportButton kind="product" target={p.id} />
    </main>
  );
}
