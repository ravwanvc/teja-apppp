export const listingCategories = [
  "Non va pishiriqlar",
  "Tayyor taomlar",
  "Meva va sabzavot",
  "Sut mahsulotlari",
  "Boshqa",
];
export const emptyListing = () => ({
  title: "",
  shop: "",
  category: listingCategories[0],
  price: "",
  original: "",
  stock: "",
  address: "",
  lat: null,
  lng: null,
  image: "",
  images: [],
  city: "Toshkent",
  allergens: "",
  storage: "",
  until: "",
  prepared_at: "",
  best_before: "",
});
export function listingIssues(p, now = Date.now()) {
  const e = {};
  if (!p.image) e.image = "Mahsulot rasmini yuklang";
  if (!p.title?.trim()) e.title = "Mahsulot nomini kiriting";
  if (!p.shop?.trim()) e.shop = "Do‘kon nomini kiriting";
  if (
    !Number.isSafeInteger(Number(p.price)) ||
    p.price < 100 ||
    p.price > 100000000
  )
    e.price = "Narx 100–100.000.000 so‘m bo‘lsin";
  if (
    !Number.isSafeInteger(Number(p.original)) ||
    Number(p.original) <= Number(p.price) ||
    p.original > 100000000
  )
    e.original = "Asl narx chegirmali narxdan katta bo‘lsin";
  if (!Number.isSafeInteger(Number(p.stock)) || p.stock < 1 || p.stock > 10000)
    e.stock = "Miqdor 1–10.000 dona bo‘lsin";
  const until = new Date(p.until).getTime();
  if (!Number.isFinite(until) || until <= now || until > now + 30 * 86400000)
    e.until = "Muddat kelgusi 30 kun ichida bo‘lsin";
  if(p.prepared_at||p.best_before){const prepared=new Date(p.prepared_at).getTime(),best=new Date(p.best_before).getTime();if(!Number.isFinite(prepared)||!Number.isFinite(best)||prepared>now+300000||best<=prepared||best<=now||until>best)e.freshness="Tayyorlangan vaqt va iste’mol muddati noto‘g‘ri";}
  if (!p.allergens?.trim()) e.allergens = "Tarkib va allergenlarni yozing";
  if (!p.storage?.trim()) e.storage = "Saqlash sharoitini yozing";
  if (
    !Number.isFinite(p.lat) ||
    !Number.isFinite(p.lng) ||
    Math.abs(p.lat) > 90 ||
    Math.abs(p.lng) > 180
  )
    e.location = "Xaritada olib ketish joyini belgilang";
  if (!p.address?.trim()) e.address = "Aniq manzilni yozing";
  return e;
}
export function listingState(p, now = Date.now()) {
  if (["pending", "review"].includes(p.image_status)) return "review";
  if (p.image_status === "rejected") return "rejected";
  if (p.until <= now) return "expired";
  if (!p.stock) return "soldout";
  if (!p.active) return "hidden";
  if (p.stock < 4) return "low";
  return "active";
}
export function fitPhoto(width, height, max = 1600) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
