"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import DemoWallet from "./demo-wallet";
import { CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { formatCard, cardBrand } from "../lib/format";
import {
  phoneDigits,
  pastedPhone,
  formatExpiry,
  validExpiry,
} from "../lib/card-form";
export function CardMark({ brand }) {
  return !["uzcard", "humo", "visa"].includes(brand) ? (
    <CreditCard size={24} />
  ) : (
    <img
      className="network-logo"
      data-brand={brand}
      src={"/payments/net-" + brand + ".png"}
      alt={brand.toUpperCase()}
    />
  );
}
export default function Wallet(props) { return <DemoWallet {...props} />; }
