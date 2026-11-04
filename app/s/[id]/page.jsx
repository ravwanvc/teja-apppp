import Link from "next/link";
import { getMongoDb } from "../../../lib/mongodb.js";
import { notFound } from "next/navigation";
import { catalog } from "../../../lib/catalog.js";
import { money } from "../../../lib/format.js";
import { ReportButton } from "../../account-tools";
export const dynamic = "force-dynamic";
export default async function Store({ params, searchParams }) {
  const { id } = await params,
    q = await searchParams,
    db = await getMongoDb(),
    u = await db.collection("users").findOne(
      { id, role: "seller" },
      { projection: { id: 1, name: 1, verified: 1, business_name: 1 } },
    );
  if (!u) notFound();
  const data = await catalog(
    db,
    new URLSearchParams({ owner: id, page: q?.page || "1" }),
  );
  const productIds = await db
    .collection("products")
    .distinct("id", { owner: id });
  const aggregate = productIds.length
    ? await db
        .collection("reviews")
        .aggregate([
          {
            $match: {
              product: { $in: productIds },
              hidden: { $in: [0, false] },
            },
          },
          { $group: { _id: null, rating: { $avg: "$rating" } } },
        ])
        .toArray()
    : [];
  const rating = aggregate[0]?.rating
    ? Math.round(aggregate[0].rating * 10) / 10
    : null;
  return (
    <main className="dashboard">
      <Link href="/">← TEJA</Link>
      <h1>
        {u.business_name || u.name} {u.verified ? "✓" : ""}
      </h1>
      <p>★ {rating || "—"}</p>
      <ReportButton kind="seller" target={id} />
      <div className="grid">
        {data.products.map((p) => (
          <article key={p.id} className="product">
            <img
              src={p.image}
              alt={p.title}
              style={{ width: "100%", height: 180, objectFit: "cover" }}
            />
            <h2>
              <Link href={"/p/" + p.id}>{p.title}</Link>
            </h2>
            <p>{money(p.price)}</p>
          </article>
        ))}
      </div>
      {data.page > 1 && <Link href={"?page=" + (data.page - 1)}>←</Link>}{" "}
      {data.page}/{data.pages || 1}{" "}
      {data.page < data.pages && (
        <Link href={"?page=" + (data.page + 1)}>→</Link>
      )}
    </main>
  );
}
