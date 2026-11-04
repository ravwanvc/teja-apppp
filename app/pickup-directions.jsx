"use client";
import Link from "next/link";
import { useState } from "react";
import { MapPin, Navigation, Copy, Check } from "lucide-react";
import { directionsLinks } from "../lib/directions";
export default function PickupDirections({ place, compact = false }) {
  const [message, M] = useState("");
  const links = directionsLinks(place);
  if (!links) return <p className="muted">Olib ketish manzili kiritilmagan.</p>;
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        place.address || `${place.lat}, ${place.lng}`,
      );
      M("Manzil nusxalandi");
    } catch {
      M("Manzilni yuqoridagi matndan nusxalang.");
    }
  }
  return (
    <section
      className={"pickup-directions " + (compact ? "compact" : "")}
      aria-label="Olib ketish manzili va yo‘nalish"
    >
      <div className="pickup-place">
        <MapPin size={21} />
        <div>
          <b>{place.shop || "Olib ketish joyi"}</b>
          <p>{place.address || `${place.lat}, ${place.lng}`}</p>
        </div>
      </div>
      <div className="direction-buttons">
        <Link href={links.google} target="_blank" rel="noopener noreferrer">
          <Navigation size={17} />
          Google Maps ↗
        </Link>
        <button
          type="button"
          className="secondary"
          onClick={copy}
          aria-label="Manzilni nusxalash"
        >
          <Copy size={16} />
        </button>
      </div>
      {!compact && (
        <small>
          Xarita ilovasi yoki yangi brauzer oynasi ochiladi. Boshlang‘ich
          joyingizni xaritada tanlang yoki joylashuvga ruxsat bering.
        </small>
      )}
      {message && (
        <small role="status">
          <Check size={13} />
          {message}
        </small>
      )}
    </section>
  );
}
