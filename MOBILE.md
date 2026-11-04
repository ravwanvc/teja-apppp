# TEJA native ilova

`mobile/` Expo SDK 58.0.20, Expo Router, React Native. WebView ishlatilmaydi. Backend — mavjud `/api/*`, `X-Client: app` va `Authorization: Bearer ...`. Access 15 daqiqa, refresh 30 kungacha; ikkisi SecureStore’da. Refresh rotatsiyasi atomik; eski token qayta ishlamaydi. Veb cookie autentifikatsiyasi app headeri bilan chetlab o‘tilmaydi. Admin mobil sessiyalari berilmaydi.

```sh
cd mobile
npm ci
# .env.example ni .env ga nusxalang, haqiqiy test backend URLini kiriting
npx expo start
```

Haqiqiy telefonda `localhost` kompyuter emas, telefonning o‘zidir. `EXPO_PUBLIC_API_URL` uchun LAN IP yoki HTTPS test domenidan foydalaning. Ekranlar: onboarding/til, auth, ro‘yxat/xarita/favorites, mahsulot/checkout, native mock gateway, buyurtma/QR/yo‘nalish, sotuvchi/raster rasm/QR skaner/qoldiq/nusxa, notifications va account/export/delete.

```sh
npm run typecheck
npm test -- --runInBand
npx expo export --platform ios --platform android
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile development --platform all
npx eas-cli build --profile preview --platform all
npx eas-cli build --profile production --platform all
npx eas-cli submit --platform ios --latest
npx eas-cli submit --platform android --latest
```

`eas init` egangizning projectId qiymatini yaratadi. `app.config.ts` dagi `uz.teja.app` identifikatorini egasi tasdiqlashi kerak. Android release xaritasi uchun tegishli Google Maps API konfiguratsiyasi va provisioning kerak bo‘lishi mumkin; bu yerda kalit yo‘q. EAS profillari sozlangan, lekin signing credential, hisob, real qurilma va store upload bajarilmagan.

Maestro: dev build o‘rnatilgan emulator/telefonda `maestro test -e TEST_PHONE=... .maestro/mock-flow.yaml`. Oqim fayli bor, ushbu muhitda Maestro yurgizilmagan. Bu fayl faqat onboarding/auth smoke oqimi; to‘liq savdo e2e emas.

Muhim cheklovlar: native live karta tokenizatsiyasi yakunlanmagan; native buyurtmada reyting hozir soddalashtirilgan 5-yulduz tugmasi; mahsulot tahriri, profil tahriri va ayrim filterlar vebdagi darajada emas. Til tanlovi saqlanadi, lekin ko‘p native matnlar ikki tilni birga ko‘rsatadi; barcha ekranlarning sof til almashishi tugamagan. Theme tanlovi SecureStore’da saqlanadi. FCM/APNs yetkazish yo‘q; durable inbox va mock transport interfeysi bor. Ommaviy relizga yubormang.

Deep-link: `teja://product?id=PRODUCT_ID` route’ni ochadi. HTTPS universal/app links uchun domen egasi AASA/assetlinks.json va entitlementlarni hali sozlashi kerak. Share veb `/p/[id]` URLini beradi.

SecureStore manbasi: https://docs.expo.dev/versions/latest/sdk/securestore/ . iOS Keychain uninstall/reinstall davomida ayrim tokenlarni saqlab qolishi mumkin; server expiry/revocation shu sabab zarur.
