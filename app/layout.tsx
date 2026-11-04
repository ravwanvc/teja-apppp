import Pwa from "./pwa";
import { LanguageProvider } from "./language";
import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./upgrade.css";
import "./premium.css";
import "./polish.css";
import Tilt from "./tilt";

export const metadata: Metadata = {
  title: "TEJA — Tejang, isrofni kamaytiring",
  manifest: "/manifest.webmanifest",
  description:
    "Yaqiningizdagi chegirmali oziq-ovqatni toping, band qiling va olib keting.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{let t='system';try{t=localStorage.getItem('teja-theme')||t}catch{}document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'})()",
          }}
        />
      </head>
      <body className="antialiased">
        <LanguageProvider>
          <Pwa />
          <Tilt />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
