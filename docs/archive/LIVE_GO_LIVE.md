# Mock → live

**Hozir “faqat env bilan productionga tayyor” holat emas.** Quyidagi kod bo‘yicha ochiq blockerlarni avval yoping.

- Live refund adapteri `/api/refunds` hozir 501 qaytaradi. Payme/Click/Subscribe uchun hujjatlashtirilgan merchant refund API, imzolar, idempotency va reconciliation kerak. Provayderning kelgan bekor qilish callbacki mavjud trigger yo‘lidan ishlaydi; bu outbound refund xizmati o‘rnini bosmaydi.
- Mobil live karta tokenizatsiyasi yo‘q. Native mock karta qo‘shishni livega mos gateway/tokenization UI bilan almashtiring.
- Barcha UI/error/notification matnlari rus tiliga to‘liq ko‘chirilmagan; web toggle qisman, native labels ko‘pincha ikki tilli.
- Native device QA, accessibility audit, barcha e2e va production load/security testlarini tugating.
- Operator rekvizitlari, aloqa, maxfiylik/saqlash muddatlari, qonuniy refund qoidalari va store anketalarini egasi/yurist tasdiqlasin.

Shundan keyin:

1. Merchant Click/Payme va Twilio Verify shartnoma/hisoblarini egasi rasmiylashtiradi. Secretlarni Cloudflare secretsga, mobil public API URLni EAS environmentga yozadi.
2. Avval alohida provider sandbox: to‘g‘ri/noto‘g‘ri imzo, noto‘g‘ri summa, callback replay, timeout, expiry, card ambiguous pay/reconcile, cancellation/refund va chek nazoratini bajaring.
3. `PAYMENT_CALLBACKS_READY=true` va/yoki `SUBSCRIBE_PAYMENTS_READY=true` ni faqat shu tekshiruvlardan keyin yoqing. `PAYMENTS_MODE=live`, `SMS_MODE=live` bo‘lsin. Eski `DEMO_MODE`ni o‘chiring. Admin live TOTP secretini sozlang; mock 123456 qabul qilinmasligini test qiling.
4. Mock va live DB/R2 resurslarini ajrating. Sinov hisoblari va kartalarini public bazaga ko‘chirmang.
5. FAQ/oferta/refund/privacy matnlaridagi shablon ogohlantirishini faqat haqiqiy yuridik tekshiruvdan keyin olib tashlang.
6. Apple/Google akkauntlari, bundle/package ownership, signing, support URL/email, hisobni o‘chirish URLi va do‘kon anketalarini yakunlang.
7. Avval TestFlight/Internal testing, so‘ng release checklist. Ommaviy reliz huquqi hamda do‘kon talablari egasi tomonidan tekshirilsin.

Haqiqiy pul yechish yoki real SMS yuborish ushbu tayyorlash ishida bajarilmagan.
