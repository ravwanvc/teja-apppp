import { currentUser } from "../../lib/auth";
import { redirect } from "next/navigation";
import Home from "../market-client";
export const dynamic = "force-dynamic";
export default async function Admin() {
  const me = await currentUser();
  if (me?.role !== "admin") redirect("/login");
  return <Home initialView="admin" />;
}
