# TEJA — hamkor do‘kon, naqd savdo va komissiya

## 1. Admin hamkorni qo‘shadi

Admin paneli → **Hamkorlik hisobi** → **Hamkor qo‘shish**. Biznes nomi, aloqa, manzil va komissiya foizini kiriting. Standart 10%. Ro‘yxatdan o‘tgan sotuvchi hisobini tanlang. Hisob hali yo‘q bo‘lsa, biznesni saqlab, keyin bog‘lash mumkin. Bir sotuvchi bitta hamkorga biriktiriladi. Sotuvchi o‘z hisobidan mahsulot joylaydi; rasm tekshiruvi avvalgidek ishlaydi.

Naqd to‘lovni o‘chirish yoki komissiya foizini o‘zgartirish faqat keyingi buyurtmalarga ta’sir qiladi. Buyurtmasi bor biznesni boshqa sotuvchi hisobiga ko‘chirish taqiqlangan.

## 2. Xaridor to‘liq naqd to‘laydi

Bitta do‘kondan savat → **To‘liq naqd** → olish majburiyatini tasdiqlash → bron. Hozir pul olinmaydi. Bron odatda 30 daqiqa; bir marta 2 soatgacha vaqt tanlash mumkin, mahsulot muddati bundan oldin tugasa o‘sha muddat qo‘llanadi. Bir xaridorda ko‘pi bilan 3 faol naqd bron.

Xaridor to‘liq summani do‘konda to‘laydi. Sotuvchi kod/QRni tekshiradi va to‘liq naqd pulni olganini belgilaydi. Shundan keyingina topshirish va komissiya qayd etiladi. QR uchun mos kamera/brauzer kerak; 8 belgili kod doim muqobil yo‘l.

## 3. Hisob misoli

100 000 so‘mlik naqd buyurtma, komissiya 10%:

- Xaridor do‘konga 100 000 so‘m beradi.
- Topshirishdan keyin do‘konning TEJAga komissiya qarzi 10 000 so‘m bo‘ladi.
- Admin 6 000 so‘m qabul qilsa va kassa hujjati bilan yozsa, qarz 4 000 so‘m qoladi.
- Admin qolgan summadan ortiq to‘lov kirita olmaydi. Takror so‘rov ikkinchi marta hisoblanmaydi.
- Buyurtma olinmasdan bekor qilinsa yoki muddati o‘tsa, qoldiq qaytadi, komissiya yozilmaydi.

Admin oynasi pul o‘tkazmaydi va fizik naqdni mustaqil tekshira olmaydi. U vakolatli adminning qabul qilish tasdig‘i va hujjatini saqlaydi. Moliyaviy yozuvlar tarixdan o‘chirilmaydi.

## 4. Sifat va qaytarish

Xaridor buyurtmada sifat murojaati yuboradi. Admin tekshiradi. Naqd to‘lov qabul qilingan buyurtmada ma’qullashdan keyin **qaytarish kutilmoqda** holati chiqadi. Do‘kon pulni amalda xaridorga qaytaradi. Admin **Tekshiruv va murojaatlar** bo‘limida hujjat raqami va tasdiq bilan qaytarishni qayd etadi. To‘liq summa qaytarilgan deb yoziladi va o‘sha buyurtma komissiyasi bir marta bekor qilinadi.

Komissiya avval to‘langan bo‘lsa, manfiy qoldiq do‘kon foydasiga avans hisoblanadi; keyingi savdolarga o‘tadi. Onlayn to‘lovda qaytarish qaydi oldindan olingan 10%ga tegishli; joyida to‘langan 90% sotuvchi bilan alohida hal qilinadi. Avtomatik bank refund API ulanmagan.

## 5. Cheklash va sifat ma’lumotlari

Admin sotuvchining yangi savdosini sabab bilan vaqtincha to‘xtatadi. Mahsulotlar yashiriladi, yangi bron va mahsulot joylash bloklanadi. Mavjud buyurtmalarni topshirish va qaytarish ochiq qoladi. Qayta ruxsat berilganda mahsulotlar avtomatik e’lon qilinmaydi — sotuvchi tekshirib yoqadi.

Tayyorlangan vaqt va iste’mol muddati olish muddatidan alohida ko‘rsatiladi. Ikkalasi kiritilsa, server vaqtlarni tekshiradi. Eski mahsulotda ma’lumot bo‘lmasa, xaridorga sotuvchidan aniqlashtirish aytiladi. Bu sotuvchi bergan ma’lumot, mustaqil sifat sertifikati emas.

## 6. SMS eslatmalar

Hisobim → **Olib ketish eslatmasi** orqali rozilik beriladi. Tasdiqlangan telefon kerak. Sayt ichidagi bildirishnomalar davom etadi.

Server sozlamalari:

```dotenv
SMS_MODE=live
REMINDER_SMS_READY=true
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_MESSAGING_SERVICE_SID=...
```

Twilio Messaging Service login SMSlari uchun ishlatiladigan Verify Service’dan alohida. Cloudflare Worker uchun har daqiqalik Cron Trigger (`* * * * *`) o‘rnating. `worker/index.ts`dagi scheduled handler qolgan vaqt 15 daqiqaga tushganda yuborishni bajaradi. Jadval sozlanmasa, sayt yopiq paytda SMS yuborilmaydi. Haqiqiy +998 yetkazilishi provayder hisobida sinovdan o‘tkazilishi kerak.

Har buyurtmaga bir yuborish so‘rovi: `submitted` — provayder qabul qildi, telefon yetkazib olganiga kafolat emas. Timeout `unknown` bo‘lib qoladi; dublikat SMS yubormaslik uchun avtomatik takrorlanmaydi. Admin uchun `/api/reminders` so‘nggi yuborish qaydlarini qaytaradi. Diagnostikada Twilio jurnali bilan solishtiring.

Transport manbasi: https://www.twilio.com/docs/messaging/api/message-resource

## 7. Ustozga ko‘rsatish ssenariysi

`TEJA-preview.html`ni Chrome yoki Edge’da oching. O‘rnatish shart emas. Google xarita uchun internet kerak. Yuqoridagi yagona belgi bu namoyish ekanini bildiradi; haqiqiy pul va SMS ishlatilmaydi.

1. Xaridor: xaritadan Bon! Bakery taklifini oching → savat → to‘liq naqd bron.
2. Berilgan topshirish kodini yozib oling.
3. Yuqoridan Sotuvchi → Buyurtmalar → Topshirish: kod va naqd tasdiq.
4. Admin → Hamkorlik hisobi → Bon! Bakery → hisobni oching. Yangi komissiyani ko‘ring.
5. Naqd komissiya qabul qilish: qisman summa va namoyish hujjat raqami → qoldiq kamayadi.
6. Xaridor buyurtmasidan sifat murojaati; admin qarori va qaytarish qaydini tekshirish mumkin.
7. UZ/RU va qorong‘i/yorug‘ rejimlarni almashtiring.

Preview ma’lumotlari faqat brauzerda saqlanadi. `Yangilash` ularni boshlang‘ich namoyishga qaytaradi. Serverli loyiha D1 bazasi bilan ishlaydi; boshlash uchun `BOSHLASH_WINDOWS.md`ni oching. Operator rekvizitlari, tashqi to‘lov/SMS kalitlari va hosting sozlamalari egasi tomonidan to‘ldiriladi.
