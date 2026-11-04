"use client";

import { useEffect } from "react";

// 3D tilt: kursor (yoki barmoq) harakatiga qarab kartani sal egadi.
// Faqat hover qo‘llab-quvvatlaydigan qurilmada va "kamroq harakat" yoqilmagan bo‘lsa ishlaydi.
const SELECTOR = ".product, .uploaded-brands button, .bank-card, .card-pay-choice, .payment-split > div";

export default function Tilt() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!matchMedia("(hover: hover)").matches) return;
    let current = null;
    const reset = el => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.style.setProperty("--mx", "50%");
      el.style.setProperty("--my", "50%");
    };
    const move = e => {
      const el = e.target instanceof Element ? e.target.closest(SELECTOR) : null;
      if (current && current !== el) reset(current);
      current = el;
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.setProperty("--ry", ((x - 0.5) * 10).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((0.5 - y) * 8).toFixed(2) + "deg");
      el.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    };
    const leave = () => { if (current) { reset(current); current = null; } };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, []);
  return null;
}
