# Google Data safety / Apple App Privacy — to‘ldirilgan texnik draft

Bu deklaratsiya tayyor kodga asoslangan dastlabki jadval. Egasi real backend, SDK versiyalari, merchant va xarita/AI provayderlarining shartlariga mosligini tekshirib, konsoldagi javoblarni tasdiqlashi kerak. “Shared” platformaga xos ta’rifdir; protsessor/service-provider istisnolari tekshiruvsiz belgilanmasin.

| Ma’lumot | Yig‘iladimi | Hisobga bog‘langanmi | Maqsad | Uchinchi tomon / oshkor bo‘lish | Ixtiyoriylik va o‘chirish |
|---|---|---|---|---|---|
| Telefon | Ha | Ha | Auth, buyurtma aloqasi | Live Twilio; faqat tegishli paid buyurtmada sotuvchiga | Hisob uchun kerak; delete bilan o‘chadi |
| Ism/account ID | Ha | Ha | Hisob va sotuvchi identifikatsiyasi | Xaridorga sotuvchi nomi; sotuvchiga buyurtma xaridor nomi | Hisob uchun kerak; ism anonimizatsiya qilinadi |
| Sotuvchi aniq joylashuvi/manzil | Ha | Ha | Do‘kon va pickup | Mahsulot sahifasida ochiq; geokoder/map xizmati | Mahsulot uchun kerak; delete bilan redaksiya |
| Xaridor qurilma joylashuvi | Faqat foydalanuvchi ruxsati bilan ishlatiladi | Hozir backendda saqlanmaydi | Yaqin takliflar | Native xarita provideriga viewport/joylashuv yuborilishi SDKga bog‘liq | Ruxsat ixtiyoriy; joylashuvsiz ro‘yxat ishlaydi |
| Yuklangan rasmlar | Ha | Sotuvchiga bog‘langan | E’lon, moderatsiya | Mahsulot rasmi ochiq; live Gemini sozlangan bo‘lsa tahlilga yuboriladi | Sotuvchi uchun kerak; R2 deletion queue |
| Buyurtma/xarid tarixi | Ha | Ha | Savdo, refund, receipt | Live Click/Payme merchant; xaridor va tegishli sotuvchi | Moliyaviy yozuvlar anonimizatsiya bilan qolishi mumkin; yuridik retention muddati belgilanmagan |
| Sharh/reyting/shikoyat | Ha, yuborilsa | Ha | Ishonch va moderatsiya | Sharhlar ochiq; shikoyat admin uchun | Ixtiyoriy; delete’da sharh matni olib tashlanadi, shikoyat o‘chadi |
| Karta brendi/last4/muddat, token | Ha | Ha | Saqlangan to‘lov usuli | Live provider tokeni; token API javobida chiqmaydi | Ixtiyoriy; delete’da o‘chadi. PAN/CVV TEJA serverida yo‘q |
| IP rate-limit | Xeshlangan bucket key | Bevosita emas | Xavfsizlik | Hosting access log sozlamasi egasiga bog‘liq | Cheklov oynasi bo‘yicha tozalanadi |
| Reklama ID / tracking | Ilova kodida yo‘q | Yo‘q | — | Reklama/tracking SDK qo‘shilmagan | Real SDK audit bilan tasdiqlash kerak |
| Diagnostika/analytics | Maxsus analytics qo‘shilmagan | Noma’lum hosting loglari | Texnik ishlash | Cloudflare/Expo operational behavior alohida tekshirilsin | Log retention egasi belgilaydi |

Google draft: personal info (name, phone, user IDs), seller location, photos, purchase history, other user-generated content — collected for app functionality/account management; encryption in transit faqat production HTTPS bilan; account deletion supported in app and web. Collection/shared checkboxlari haqiqiy provider shartlari bo‘yicha tasdiqlanadi.

Apple draft: contact info, identifiers (user ID), purchases, user content, seller precise location — linked to user and used for app functionality. Tracking: kodda yo‘q; SDK auditdan keyin “not used for tracking” tasdiqlanishi mumkin. Privacy nutrition label’da barcha SDK va server protsessorlari hisobga olinsin.

Delete faol buyurtma/refund paytida rad etiladi. O‘chirilganda sessiya, telefon, karta, draft va kontaktlar olib tashlanadi; R2 fayllari navbat orqali o‘chiriladi. Bekor qolgan cleanup ishlarini scheduled Worker qayta ishlashi kerak. Haqiqiy backup retention, qonuniy yozuvlar va maxfiylik matni hali yurist/egasi tomonidan yakunlanmagan.
