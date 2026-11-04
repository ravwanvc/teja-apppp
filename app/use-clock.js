"use client";
import { useEffect, useState } from "react";
export function useClock() {
  const [now, N] = useState(0);
  useEffect(() => {
    const tick = () => N(Date.now());
    queueMicrotask(tick);
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
