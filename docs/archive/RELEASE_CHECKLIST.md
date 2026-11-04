# Release gate — hozir YOPIQ

## Implementatsiya
- [x] Mock/live rejimlari, mockda provider tarmoq so‘rovlari bloklangan
- [x] Telefon OTP, expiry, urinish/cooldown, verified server gate
- [x] Parol+SMS, parolsiz SMS, SMS reset, admin mock/TOTP 2FA
- [x] Mock signed callback, qoldiq/chek/idempotency/refund yo‘li
- [x] Bildirishnomalar bazasi, inbox, scheduled reminder interfeysi
- [x] Rasm approved/pending/rejected, admin oqimi
- [x] Katalog API pagination/search, SSR mahsulot/do‘kon, sitemap/robots/manifest
- [x] Hisob export/delete, app bearer/refresh, SecureStore
- [x] Native Expo ekranlar va EAS config
- [x] Ikonka/adaptive icon/splash va do‘kon matni draftlari
- [ ] To‘liq uz/ru localization
- [ ] Native ekranlarda veb bilan funksional tenglik
- [ ] HTTPS universal links
- [ ] FCM/APNs real push
- [ ] Barcha filtrlar butun katalog bo‘yicha serverda (ayrim filtrlar sahifa ichida)
- [ ] Live outbound refund va native live karta
- [x] PWA manifest/icon va statik offline fallback; shaxsiy API javoblari cache qilinmaydi

## Tekshiruv va egaga tegishli ishlar
- [ ] Real iPhone/Android, permission deny, offline, accessibility, deep-link, token expiry
- [ ] Maestro to‘liq savdo oqimi
- [ ] Imzolangan IPA/AAB, EAS credentials, App Store/Play upload
- [ ] Real merchant sandbox/callback/refund tekshiruvlari
- [ ] Operator rekvizitlari, support email/URL, yurist tasdiqlagan hujjatlar
- [ ] Data safety/App Privacy deklaratsiyasini SDK va backend auditiga mos tasdiqlash
- [ ] Do‘kon skrinshotlari haqiqiy qurilmadan olish
- [ ] Rate-limit, backup/restore, monitoring, production load testi

Bajarilgan avtomatik tekshiruvlarning haqiqiy chiqishi `docs/validation/` da. Ochiq bandlar yopilmaguncha public release yo‘q.
