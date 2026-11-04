# TEJA — yakuniy ish hisoboti

Sana: 2026-10-28. **Natija: kengaytirilgan va avtomatik testlardan o‘tgan mock test versiyasi. Barcha qabul mezonlari bajarilmadi; production/App Store/Google Play public release tayyor emas.**

## 1. Nima qilindi

### 1-bosqich — mock

- `PAYMENTS_MODE` va `SMS_MODE`, default mock; provider kalitlari bo‘lsa ham mockda payment/SMS HTTP so‘rovlari yuborilmaydi.
- 6 raqamli, salt+hash saqlanadigan OTP: 5 daqiqa, 5 urinish, atomik 60 soniya cooldown; one-time consume. SINOV SMS oynasi, faqat mockda 123456.
- Majburiy ro‘yxatdan o‘tish/kirish tasdig‘i, buyurtma va sotuvchi amallarida server phone_verified gate.
- Mock Click/Payme/karta gateway: pay/reject/expire. Ichki efemer kalitlar bilan mavjud imzo/autentifikatsiyali callback funksiyalari va qoldiq/chek triggerlari ishlaydi. Mock karta Payme callback yo‘lidan, alohida mock_method bilan o‘tadi.
- Mock cheklar/oqimda SINOV belgisi; PAN/CVV serverga kelishi rad etiladi.

### 2-bosqich — nuqsonlar va xavfsizlik

- Parol kamida 8 belgi; parol+SMS, parolsiz SMS va SMS reset. Reset sessiyalarni bekor qiladi.
- Telefon+IP va IP login limiti; admin mock 2FA yoki live TOTP.
- Rasm mockda approved; live kalitsiz/noaniq pending sifatida R2ga saqlanadi; aniq not_food rad etiladi. Admin panelda pending rasmlar ko‘rinadi va approve/reject qilinadi.
- Mock refund_due → refunded; seller cancelda xaridor bildirishnomasi. Admin refund/report navbatlari. **Live outbound refund adapteri tugallanmagan** va 501 bilan bloklanadi.
- Notifications jadvali/triggerlari, inbox, o‘qilgan belgi, scheduled 30-min reminder. Native lokal test notification tugmasi; real push yo‘q.
- 5 soniyalik to‘liq polling o‘rniga 15 soniyalik changes-version tekshiruvi, hidden tabda to‘xtaydi. Public catalog API page/search/city/category/maxPrice/sort.
- Sotuvchiga xaridor telefoni faqat o‘zining paid/test buyurtmasida. Qo‘ng‘iroq/nusxa; chekdan sotuvchiga pickup code chiqmaydi.
- Mahsulot/sotuvchi/sharh shikoyatlari va admin resolve.
- JSON export, hisobni o‘chirish, faol buyurtma/refund DB guard, R2 durable cleanup navbati; delete sahifasi.
- Uzoq satrlar formatlandi; SSR bosh sahifa client modulidan ajratildi; OTP, mock payment, catalog, mobile-session va notification mantiqlari alohida modullarda. API route ichida hanuz ko‘p action branch bor.
- Ishlatilmagan UI komponentlari, examples, connectors va recharts olib tashlandi; package `teja`, npm lock yangilandi.

### 3-bosqich — veb

- Serverda boshlang‘ich katalog, `/p/[id]` metadata/OG/Twitter va `/s/[id]`, sitemap/robots.
- PWA manifest/ikonkalar va tarmoqsiz statik fallback. Auth/API ma’lumotlari cache qilinmaydi.
- 3 tagacha rasm backend validatsiyasi va veb/native galereya; sotuvchida nusxalash va yangi muddat.
- 9 shahar jadvali; shahar tanlovi va geokoder biasi.
- Oferta/terms/privacy/refunds/help/how/FAQ: uz/ru shablonlar, yurist tekshiruvi belgisi, checkout havolalari.
- Unsplash o‘rniga lokal SVG; Leaflet/MapLibre npm bundle; tashqi font import olib tashlandi.
- Modal focus trap/Esc va fokusni qaytarish. Theme saqlanadi.
- Til switcher va ko‘p statik tarjimalar bor, **barcha matnlar to‘liq lokalizatsiya qilinmagan**.

### 4-bosqich — native

- Expo Router/React Native/TypeScript ekranlari; WebView yo‘q. Offers/map/location/favorites, product/gallery/share, native mock gateway, order/receipt/QR/directions, seller/image picker/camera/stock/copy/QR scan, notifications, account/export/delete.
- Opaque 15-min access + rotating 30-day refresh, hash DBda, SecureStore qurilmada. Cookie/app-header ajratilgan; mobil admin kirishi bloklangan.
- Shared tiplar/validatsiya; API kontrakt hujjati.
- app.config, EAS profiles, bundle/package `uz.teja.app`, icon/adaptive/splash. Owner/project/signing sozlanmagan.
- Uz/ru/en listing draftlari, privacy questionnaire, screenshot ro‘yxati va release checklist.

### 5–6-bosqich — test va hujjatlar

- Eski 8 SQL migratsiya byte-for-byte saqlandi, 0008 qo‘shildi. Lokal D1 9 migratsiyani qo‘lladi.
- Regressiya, yangi mock/security/mobile-session/moderation testlar; Playwright va mobil Jest; Maestro smoke fayli.
- README/Windows/DEPLOY/MOBILE/LIVE_GO_LIVE/API/security/store/privacy hujjatlari.

## 2. Haqiqatan yurgizilgan tekshiruvlar

To‘liq chiqishlar `docs/validation/` ichida; taxminiy “pass” yo‘q.

| Buyruq / tekshiruv | Natija |
|---|---|
| `npm test` | PASS: barcha 14 test entry script; ichki importlar sabab ayrim fixture regressiyalari takror bajariladi |
| `npm run lint` | Exit 0; **0 error, 44 warning**. Ogohlantirishlar asosan oldingi unused importlar, img va effect dependency tavsiyalari |
| `npm run typecheck` | Exit 0, TypeScript xatosi yo‘q |
| `npm run check:project` | PASS, 9 migration/journal/env tekshiruvi |
| `npm run build` | PASS, vinext production build. Framework route classification warningi bor |
| `npm run db:migrate:local` | PASS, lokal D1: 9/9 |
| Playwright Chromium | **1 passed (57.5s)**. Browser registration+SMS, checkout/gateway/receipt, SSR product/OG. Seller fixture/upload/fulfilment va review API orqali — to‘liq UI-only seller e2e emas |
| Mobil `npm run typecheck` | Exit 0 |
| Mobil `npm test -- --runInBand` | **1 suite, 2 tests passed** |
| `expo export --platform android --platform ios` | PASS, ikkala platforma uchun Hermes bundle yaratildi |
| Original migratsiyalarni ZIP bilan byte taqqoslash | PASS: 0000–0007 o‘zgarmagan |

Mock test `fetch`ni xato tashlaydigan qilib almashtiradi: tashqi payment/SMS chaqiruvi bo‘lsa test yiqiladi. Testlar OTP expiry/attempts/cooldown/replay, signed callback/replay/summa, qoldiq poygasi, receipt/IDOR/wallet isolation, refund, notifications, account delete, role/origin, mobile refresh rotation, pending-image/admin oqimlarini qamraydi.

Muhitdagi Chromium CDN yuklashi muvaffaqiyatsiz bo‘ldi; npm orqali olingan Chromium paketidan foydalanib brauzer testi muvaffaqiyatli bajarildi. Birinchi brauzer testidagi hydration timing aniqlanib, auth inputlari tayyor bo‘lish belgisigacha kutish bilan qayta tekshirildi.

## 3. Bajarilmagan yoki tekshirilmagan

**Bajarilmagan kod/mahsulot ishlari:**

- To‘liq uz/ru localization; ayrim eski UI/server error/notification stringlar o‘zbekcha. Native ko‘p joyda ikki tilni birga ko‘rsatadi, til tanlovi barcha ekran matnlarini almashtirmaydi.
- Real outbound refund; adapter contract bor, merchant implementatsiyasi yo‘q. Live refund tugmasi 501; o‘zboshimcha “refunded” belgilanmaydi.
- Native live card tokenization; to‘liq mahsulot/profil tahriri; erkin rating/comment UX; native/web barcha filterlarning tengligi.
- HTTPS universal/app links, real FCM/APNs. Local mock notification tugmasi kodda, qurilmada tekshirilmagan.
- Favorites/verified/near/discount kabi ayrim filterlar joriy sahifa ichida; management/order/review pagination hali bounded list. Barcha UI empty/error/loading holatlarining to‘liq QA auditi yo‘q.
- To‘liq UI-only seller→buyer→delivery→review Playwright va mobil commerce e2e. Maestro faqat auth smoke script.
- Account va moliyaviy yozuvlarning yuridik retention muddati, moderatsiya siyosati va operator rekvizitlari.

**Tekshirilmagan tashqi muhitlar:**

- Haqiqiy iPhone/Android yoki simulator, Expo Go/dev build permissions/maps/QR/share, offline/device accessibility.
- EAS signed IPA/AAB, TestFlight/Internal test upload, public stores.
- Real Click/Payme/Subscribe/Twilio/Gemini; real money/SMS yuborilmadi.
- Cloudflare remote deploy/cron, remote D1/R2, load/penetration tests, backup recovery.

## 4. Egasi qo‘lda bajaradigan qadamlar

1. README orqali lokal mockni ishga tushiring; sotuvchi/xaridor test hisoblari yarating.
2. Ochiq kod blockerlarini yakunlang, qurilmalarda va provider sandboxida sinang.
3. Cloudflare, EAS, Apple/Google akkauntlari, app identifikatorlari va signingni qonuniy egasi sozlasin.
4. Merchant shartnomalari, SMS account, API secretlar va callback domenlarini o‘rnating; secretlarni kodga yozmang.
5. Support email/URL, privacy/delete URL, rekvizitlar, yurist tasdiqlagan oferta/refund/retention va store anketalarini to‘ldiring.
6. Avval cheklangan internal testing; barcha gate’lar yopilgachgina public release.

## 5. Ma’lum cheklov va xavflar

Mock 123456 har qanday faol mock OTP uchun ishlaydi: internetga ochiq production autentifikatsiyasi emas. Mock data alohida DBda bo‘lsin. Global changes counter real-time event stream emas. SQL testlar distributed D1 poygalari yoki production loadni to‘liq isbotlamaydi. 44 lint warning saqlangan; real provider/node SDK xavfsizlik auditi hali kerak. PWA offline sahifasi buyurtma yaratmaydi va hech qanday to‘lovni offline tasdiqlamaydi.

Mock/test buildni tugallangan ommaviy mahsulot sifatida yubormang. App Store/Google Play qabulini kafolatlab bo‘lmaydi. `PAYMENTS_MODE=live` va `SMS_MODE=live`ga o‘tishning o‘zi yuqoridagi blockerlarni tuzatmaydi.
