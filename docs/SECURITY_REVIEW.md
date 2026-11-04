# Tarixiy xavfsizlik qaydlari

Quyidagi audit SQL-era buildga tegishli. U MongoDB implementatsiyasining yangi security review'i emas, shuning uchun MongoDB atomarligi yoki xavfsizligini isbotlovchi dalil sifatida ishlatmang.

- Mock to‘lovda tashqi payme-subscribe chaqiruvi ham bloklanadi; raw live HTTP callback route’lar mockda 410 qaytaradi.
- OTP xeshi salt bilan saqlanadi, 5 daqiqa/5 urinish/60 soniya qayta yuborish. One-time delete atomik. Parol reset eski cookie va mobile sessiyalarni bekor qiladi.
- Login IP va telefon+IP bo‘yicha limitlanadi. Admin live TOTP yoki mock 2FA talab qiladi.
- Web mutationlarda origin, HttpOnly/SameSite cookie saqlangan; bearer yo‘li origin bo‘lmagan app+valid token orqali. X-Client headeri yolg‘iz cookie sessiyasini native sessiyaga aylantirmaydi.
- Buyurtma, chek, kartalar owner tekshiruvlari; sotuvchiga pickup kodi berilmaydi. Xaridor telefonini faqat tegishli sotuvchi va to‘langan buyurtma oladi.
- SQL parametrli; sort va report table tanlovlari allowlist. Search LIKE wildcardlari escape qilinadi. React matnni escape qiladi, receipt mavjud HTML escapingni saqlaydi.
- Upload magic header/MIME/hajm, owner va rate-limit tekshiruvi saqlangan. Rasm header tekshiruvi to‘liq antivirus yoki to‘liq image decoder xavfsizlik auditi emas.
- Stock/receipt/callback replay SQLite triggerlari orqali; parallel oxirgi dona testida bittasi rad etiladi. D1 emulator SQLite testlari distributed load proof emas.
- Account delete faol buyurtma/refund DB triggeri bilan himoyalangan, R2 cleanup durable queue.
- 8 belgili pickup code taxminini cheklash uchun sotuvchi bo‘yicha 10/min urinish limiti qo‘shildi.

Ochiq: real penetration test, external provider contracts/sandbox, distributed rate-limit/load, TOTP recovery UX, universal link domain proof, log/backup retention, to‘liq UGC moderatsiya siyosati, rate-limitlarning barcha D1 xarajatlariga ta’siri. Maxsus malware scanning yo‘q. Mock universal SMS kodi ochiq test muhitidan tashqarida ishlatilmasin.
