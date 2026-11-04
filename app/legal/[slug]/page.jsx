import Link from "next/link";
import { notFound } from "next/navigation";
import { legal } from "../../../lib/legal.js";
export default async function Legal({ params, searchParams }) {
  const { slug } = await params,
    q = await searchParams,
    l = q?.lang === "ru" ? "ru" : "uz",
    entry = legal[slug];
  if (!entry) notFound();
  return (
    <main className="dashboard">
      <Link href="/">← TEJA</Link> · <Link href="?lang=uz">O‘zbek</Link> ·{" "}
      <Link href="?lang=ru">Русский</Link>
      <h1>{entry[l][0]}</h1>
      <p className="wallet-notice">
        {l === "uz"
          ? "SHABLON — yurist ko‘rib chiqishi kerak. Ommaviy chiqarishga tayyor huquqiy hujjat emas."
          : "ШАБЛОН — необходима проверка юриста. Не готовый юридический документ для публичного запуска."}
      </p>
      <p>{entry[l][1]}</p>
    </main>
  );
}
