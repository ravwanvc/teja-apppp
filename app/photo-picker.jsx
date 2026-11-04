"use client";
import { Translated } from "./language";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Check, RefreshCw } from "lucide-react";
import { fitPhoto } from "../lib/listing-tools";
export async function preparePhoto(file) {
  if (file.size > 20 * 1024 * 1024)
    throw Error("Rasm 20 MB dan kichik bo‘lsin");
  if (
    !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) &&
    !/^image\//.test(file.type)
  )
    throw Error("Rasm faylini tanlang");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth * img.naturalHeight > 60000000)
      throw Error("Rasm juda katta. Pastroq o‘lchamda suratga oling.");
    const size = fitPhoto(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (v) => (v ? resolve(v) : reject(Error("Rasm tayyorlanmadi"))),
        "image/jpeg",
        0.86,
      ),
    );
    if (blob.size > 2_000_000)
      throw Error("Rasm 2 MB dan oshdi. Kichikroq rasm tanlang");
    return new File([blob], "mahsulot.jpg", { type: "image/jpeg" });
  } catch (e) {
    if (e.name === "EncodingError")
      throw Error(
        "Bu rasm formati ochilmadi. Kamerada JPG oling yoki JPG / PNG tanlang.",
      );
    throw e;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export default function PhotoPicker({
  value,
  onChange,
  onBusy = () => {},
  onPending = () => {},
}) {
  const camera = useRef(null),
    gallery = useRef(null),
    controller = useRef(null);
  const [file, F] = useState(null),
    [preview, P] = useState(""),
    [busy, B] = useState(false),
    [msg, M] = useState("");
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!file) {
      queueMicrotask(() => P(""));
      return;
    }
    const url = URL.createObjectURL(file);
    queueMicrotask(() => P(url));
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const setBusy = (v) => {
    B(v);
    onBusy(v);
  };
  async function choose(e) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    setBusy(true);
    M("Rasm moslashtirilmoqda…");
    try {
      const f = await preparePhoto(picked);
      F(f);
      onPending(true);
      M("Rasm tayyor. Tekshirib, yuklashni tasdiqlang.");
    } catch (e) {
      M(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    setBusy(true);
    M("Rasm yuklanmoqda va tekshirilmoqda…");
    controller.current = new AbortController();
    const timeout = setTimeout(() => controller.current?.abort(), 35000);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/image", {
        method: "POST",
        body: fd,
        signal: controller.current.signal,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Rasm yuklanmadi");
      onChange(d.url, d.review);
      F(null);
      onPending(false);
      M(d.review?.note || "Rasm saqlandi");
    } catch (e) {
      M(
        e.name === "AbortError"
          ? "Yuklash to‘xtadi. Qayta urinib ko‘ring."
          : e.message,
      );
    } finally {
      clearTimeout(timeout);
      setBusy(false);
    }
  }
  return (
    <div className="photo-studio">
      <div className={"photo-stage " + (preview || value ? "has-photo" : "")}>
        {preview || value ? (
          <img
            src={preview || value}
            alt={preview ? "Yuklashdan oldingi rasm" : "Mahsulot rasmi"}
          />
        ) : (
          <>
            <Camera size={44} />
            <h3>
              <Translated>Mahsulotni ko‘rsating</Translated>
            </h3>
            <p>Yorug‘ joyda, mahsulotning o‘zi aniq ko‘rinadigan rasm oling.</p>
          </>
        )}
        {value && !preview && (
          <span className="photo-saved">
            <Check size={14} /> Yuklangan
          </span>
        )}
      </div>
      <div className="photo-choices">
        <button
          type="button"
          disabled={busy}
          onClick={() => camera.current?.click()}
        >
          <Camera size={18} />
          <Translated>Kamera bilan olish</Translated>
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={18} />
          <Translated>Galereyadan tanlash</Translated>
        </button>
      </div>
      <input
        hidden
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Kameradan mahsulot rasmi"
        onChange={choose}
      />
      <input
        hidden
        ref={gallery}
        type="file"
        accept="image/*"
        aria-label="Galereyadan mahsulot rasmi"
        onChange={choose}
      />
      {file && (
        <div className="photo-confirm">
          <small>
            Yuklanadigan rasm: {Math.ceil(file.size / 1024)} KB · JPG
          </small>
          <button type="button" disabled={busy} onClick={upload}>
            {busy ? (
              <RefreshCw className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            <Translated>Shu rasmni yuklash</Translated>
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              F(null);
              onPending(false);
              M("Rasm tanlash bekor qilindi");
            }}
          >
            <Translated>Bekor qilish</Translated>
          </button>
        </div>
      )}
      <p className="photo-feedback" role="status">
        {msg}
      </p>
      <small className="muted">
        Telefon brauzeri qo‘llasa orqa kamera ochiladi. Kompyuterda fayl tanlash
        oynasi ochilishi mumkin. Rasm uzun tomoni 1.600 px gacha
        moslashtiriladi. AI ulanganida rasm Gemini xizmatiga yuboriladi.
      </small>
    </div>
  );
}
