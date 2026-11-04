"use client";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
const key = "teja-theme";
const valid = (v) => (["light", "dark", "system"].includes(v) ? v : "system");
export default function ThemeSwitcher() {
  const [mode, setMode] = useState("system"),
    [ready, R] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        setMode(valid(localStorage.getItem(key)));
      } catch {}
      R(true);
    });
    const sync = (e) => {
      if (e.key === key || e.key === null) setMode(valid(e.newValue));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode, ready]);
  function choose(v) {
    setMode(v);
    try {
      localStorage.setItem(key, v);
    } catch {}
  }
  const modes = ["dark", "light", "system"];
  const next = modes[(modes.indexOf(mode) + 1) % 3];
  const names = { dark: "Qorong‘i", light: "Yorug‘", system: "Avto" };
  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  return (
    <aside className="appearance-bar" aria-label="Sayt ko‘rinishi">
      <button
        className="theme-cycle"
        disabled={!ready}
        onClick={() => choose(next)}
        aria-label={names[mode] + " rejim. " + names[next] + " rejimga o‘tish"}
        title={names[mode] + " → " + names[next]}
      >
        <Icon size={20} />
      </button>
    </aside>
  );
}
