import { getMongoDb } from "../../lib/mongodb.js";
const xml = (s) =>
  String(s).replace(
    /[<>&'\"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c],
  );
export async function GET() {
  const db = await getMongoDb();
  const rows = await db
    .collection("products")
    .find({ active: { $in: [1, true] }, until: { $gt: Date.now() } })
    .project({ _id: 0, id: 1 })
    .limit(45000)
    .toArray();
  const base = process.env.PUBLIC_SITE_URL || "http://localhost:5173";
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      ["/", ...rows.map((p) => "/p/" + p.id)]
        .map(
          (path) =>
            "<url><loc>" + xml(new URL(path, base).href) + "</loc></url>",
        )
        .join("") +
      "</urlset>",
    { headers: { "Content-Type": "application/xml" } },
  );
}
