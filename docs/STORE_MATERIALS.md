# Do‘kon materiallari — DRAFT

Bu fayl listing shabloni. Hali public submission qilmang: mahsulot sinov rejimida, ochiq funksional va QA kamchiliklari bor.

## Listing

| Maydon | uz | ru | en |
|---|---|---|---|
| Nom | TEJA | TEJA | TEJA |
| Qisqa tavsif | Yaqindagi chegirmali oziq-ovqatni toping va olib keting. | Находите продукты со скидкой рядом и забирайте сами. | Find discounted food nearby and collect it locally. |
| Kalit so‘zlar | ovqat,tejamkor,chegirma,do‘kon,olib ketish | еда,скидки,продукты,самовывоз,магазин | food,savings,discounts,pickup,local |
| Yangiliklar | Birinchi ichki sinov: takliflar, mock SMS, buyurtma, chek va kod. | Первый внутренний тест: предложения, тестовые SMS, заказы, чеки и коды. | Initial internal test: offers, mock SMS, orders, receipts and pickup codes. |
| Kategoriya taklifi | Food & Drink / oziq-ovqat | Еда и напитки | Food & Drink |

### To‘liq tavsif — uz

TEJA yaqin do‘kon va oshxonalardagi ortiqcha oziq-ovqatni chegirmada topishga yordam beradi. Takliflarni ko‘ring, tarkib va olib ketish vaqtini tekshiring, telefoningizni tasdiqlang va mahsulotni band qiling. 10% oldindan, qolgan 90% mahsulotni olishda to‘lanadi. Do‘konda 8 belgili kodni ko‘rsating.

Sotuvchilar mahsulot rasmlari, narx, qoldiq va manzilni joylay oladi. Xaridorlar buyurtma holatini, chek va olib ketish kodini ko‘radi. Mahsulot xavfsizligi va allergenlar haqidagi ma’lumotni sotuvchidan tekshiring.

Ushbu ichki test versiyasida SMS va to‘lov simulyatsiya qilinadi; haqiqiy pul olinmaydi va SMS yuborilmaydi. Funksiyalar va tarjimalar hali sinovdan o‘tmoqda.

### Полное описание — ru

TEJA помогает находить продукты со скидкой в ближайших магазинах и заведениях. Просматривайте предложения, проверяйте состав и время получения, подтверждайте телефон и бронируйте товар. Предоплата составляет 10%, оставшиеся 90% оплачиваются при получении. В магазине покажите 8-значный код.

Продавцы могут размещать фотографии, цены, остатки и адрес. Покупатели видят статус заказа, чек и код получения. Уточняйте сведения о безопасности продукта и аллергенах у продавца.

В этой внутренней тестовой версии SMS и платежи имитируются: деньги не списываются, SMS не отправляются. Функции и переводы проходят проверку.

### Full description — en

TEJA helps you discover discounted surplus food at nearby shops and food businesses. Browse offers, check ingredients and collection times, verify your phone and reserve a product. Pay 10% in advance and the remaining 90% at collection. Show the eight-character pickup code at the shop.

Sellers can publish product photos, prices, stock and location. Buyers can view order status, receipts and pickup codes. Confirm food safety and allergen information with the seller.

This internal test version simulates SMS and payments. No money is charged and no SMS is sent. Features and translations are still under testing.

## Egasi to‘ldiradigan maydonlar

- Support email: **TO‘LDIRILMAGAN** — egasining haqiqiy manzili kerak.
- Privacy URL: `https://YOUR-DOMAIN/legal/privacy` — placeholder; haqiqiy domen va yurist tasdiqlagan matn kerak.
- Support URL: `https://YOUR-DOMAIN/legal/help` — placeholder.
- Account deletion URL: `https://YOUR-DOMAIN/delete-account` — haqiqiy HTTPS domenini qo‘ying.
- Copyright/operator: **TO‘LDIRILMAGAN**.
- Age rating: zo‘ravonlik, qimor, kattalar kontenti yo‘q deb rejalashtirilgan; UGC (rasm/sharh) bor. Yakuniy ratingni App Store/Play anketasi va moderatsiya imkoniyatlari belgilaydi, oldindan tasdiqlangan yosh reytingi yo‘q.

## Reviewer access (faqat ajratilgan mock test backend)

Sotuvchi va xaridor uchun alohida test telefonlarini ro‘yxatdan o‘tkazing; mavjud yoki roziliksiz odamning raqamini live provayderga yubormang. Masalan, yopiq mock muhitida xaridor `+998900000001`, sotuvchi `+998900000002`; SMS simulyatoridan keyin kod `123456`. Parolsiz SMS kirishi mavjud, do‘konlarga haqiqiy admin/merchant credential berilmang. Hisoblar avtomatik seed qilinmagan; test backendda ro‘yxatdan o‘tish kerak. Reviewer yo‘riqnomasi: telefon → SMS yuborish → 123456 → taklif → shart → mock to‘lash → chek → sotuvchi kodi.

App Review note draft: TEJA sells physical food collected outside the app; payment uses an external merchant flow. This submitted internal-testing build uses simulated payments and SMS and must not be presented as a finished public release. No digital content is sold via the checkout.

## Screenshot rejasi

Haqiqiy qurilmada har bir til uchun: takliflar, xarita, mahsulot/galereya, checkout, sinov gateway, chek/QR, sotuvchi, hisobni o‘chirish. Mock skrinshotlarda test belgisi ko‘rinsin; mavjud bo‘lmagan funksiya yoki soxta mahsulot ko‘rsatkichini reklama qilmang.

- iPhone: 1206×2622 va 1320×2868 portrait variantlar, topshirish paytida App Store Connect talab qilgan display guruhini tekshiring. PNG/JPEG, alpha yo‘q.
- iPad qo‘llab-quvvatlash yoqilgan: 13-inch uchun qurilma/simulator o‘lchamida qo‘shimcha rasmlar, amaldagi portal talabini tekshiring.
- Google Play: kamida 2 screenshot; 1080×1920 portrait tanlash mumkin. PNG 24-bit/JPEG, alpha yo‘q. Eng uzun tomon eng qisqasidan 2 martadan oshmasin, tomonlar 320–3840 px oralig‘ida.
- App icon: `mobile/assets/icon.png` 1024×1024 RGB. Adaptive foreground: `adaptive-icon.png`; splash: `splash.png`. Grafiklar oddiy TEJA wordmark; brend egasi tasdiqlashi kerak.

## Rasmiy manbalar (2026-10-28 tekshirildi)

- Apple enrollment, $99/year: https://developer.apple.com/help/account/membership/program-enrollment
- Apple physical goods, 3.1.3(e): https://developer.apple.com/app-store/review/guidelines/
- Google Play registration, $25 once: https://support.google.com/googleplay/android-developer/answer/6112435
- Apple screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- Play preview assets: https://support.google.com/googleplay/android-developer/answer/9866151

Tariflar, talablar va portal anketalarini topshirish kuni qayta tekshiring. Listing matni yoki bu yo‘riqnoma do‘kon qabul qilishiga kafolat bermaydi.
