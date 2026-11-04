import { catalog } from "../lib/catalog.js";
import { getMongoDb } from "../lib/mongodb.js";
import MarketClient from "./market-client";
export const dynamic = "force-dynamic";
export default async function Home() {
  let initialProducts = [];
  try {
    initialProducts = (
      await catalog(await getMongoDb(), new URLSearchParams("limit=24"))
    )
      .products;
  } catch {
    /* The client can retry after a transient MongoDB connection failure. */
  }
  return <MarketClient initialProducts={initialProducts} />;
}
