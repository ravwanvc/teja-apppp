# Admin kirishi

`teja` ichida `npm run admin:setup` bajaring, telefon va yangi parolni kiriting. `npm run admin:check` tekshiradi. Serverni qayta ishga tushiring va `/login`dan kiring. 2FA va SMS kodi talab qilinmaydi.

Hostingda `ADMIN_PHONE` va `ADMIN_PASSWORD_HASH` qiymatlarini lokal `.env`dan muhit sozlamalariga o‘tkazib, redeploy qiling. Oddiy foydalanuvchini nomiga qarab admin deb belgilash yo‘q. Telefon va parol tekshiruvi saqlangan.

Parol yo‘qolsa `admin:setup`ni yana ishlating va hosting qiymatlarini yangilang. Maxfiy qiymatlarni GitHub yoki chatga yubormang.
