# 2026-11-02

- Click/Payme API kalitisiz sinov to‘lovlari, alohida tasdiqlash oynasi va idempotent chek.
- Naqd hamkorlik saqlandi; sayt naqd to‘lovgagina cheklanmaydi.
- SMS va admin 2FA talab qilinmaydi. Parolni tiklash maxfiy bir martalik kalit bilan.
- Standart Next.js; Vercel konfiguratsiyasi; MongoDB Atlas yagona doimiy baza.
- Rasmlar uchun doimiy baza saqlashi, 2 MB chegara.
- Interaktiv HTML previewda ham tasdiqlash va bekor qilish oqimi.

Eski ma’lumotlar avtomatik ko‘chirilmaydi. Yangi papkada ishga tushiring.

## Premium interfeys (Click / Payme)
- Click va Payme tugmalari ostidagi "Sinov — pul yechilmaydi" yozuvi olib tashlandi (demo rejimda).
- Yangi `app/premium.css` va `app/tilt.jsx`: 3D egilish, yorug‘lik dog‘i, kartalarning ketma-ket paydo bo‘lishi.
- Click logotipi qora, Payme logotipi oq kafelda; ikkalasi ham `public/payments/*-upload.png` dagi asl rasmlar.
- To‘lov rejimi: `PAYMENTS_MODE` berilmasa `mock` — .env da Click/Payme kalitlari shart emas.

## Dizayn tuzatishlari (polish)
- `app/polish.css` qo‘shildi (layout.tsx da oxirgi import): barcha sahifalarda yon bo‘sh joy (kompyuterda ~120–220px, ≈5–6 sm), mobilda 14–36px. Sabab: `upgrade.css` da `main` yon padding atigi 28px edi.
- Karta qo‘shish formasi: maydonlar bir xil balandlikda (54px), telefon maydoni tekislandi.
- Uzcard / Humo / Visa logolari bir xil tile ko‘rinishida qayta tayyorlandi: `public/payments/net-*.png`. Karta raqami maydonida logo endi kesilmaydi.
- Saqlangan karta: premium 3D dizayn (chip, gologramma chiziqlari, brendga mos rang), 1.586 nisbatda.
- O‘chirish kerak bo‘lsa: layout.tsx dagi `import "./polish.css"` ni olib tashlang.
