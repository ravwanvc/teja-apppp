# API contract

Types: `packages/shared/index.ts`. Versioned /api/v1 wrapper o‘rniga mavjud /api endpointlari mobil uchun moslangan.

Web GET/POST cookie sessiya ishlatadi. POST `Origin` host bilan teng bo‘lishi kerak. Native: `X-Client: app`, origin yubormaslik, login’dan keyin `Authorization: Bearer ACCESS`. Cookie bilan app header aralashtirilsa cookie qabul qilinmaydi. Account/auth/receipt javoblari no-store. Server xatolari `{error:string}` va 4xx/5xx.

| Endpoint | Amal |
|---|---|
| POST /api/phone | `{action:'send',phone,purpose:'register'|'login'|'reset'}`; mockCode faqat mockda |
| POST /api/auth | register(name,role,password,phone,code), login, otpLogin, reset, logout |
| POST /api/auth (app) | `{action:'refresh',refreshToken}` → yangi accessToken/refreshToken/expiresIn |
| GET /api/products | q,city,category,owner,sort(new/price/ending),maxPrice,page,limit(1–60) |
| GET /api/product?id= | Bitta faol mahsulot |
| GET /api/data | Auth contextdagi product/order/growth data; `catalog=1` bilan paginated catalog |
| POST /api/data | create, editProduct, restock, checkout, schedule, cancel, collect, favorite, review, seller/image moderation |
| POST /api/payments/mock | `{id,outcome:'pay'|'reject'|'expire'}`; faqat owner+is_mock+mock mode |
| POST /api/payments/payme | Live Payme Merchant JSON-RPC callback, Basic signature |
| POST /api/payments/click | Live Click form callback, MD5 signature |
| GET/POST /api/cards | Own wallet; mock add(brand,last4,expiry), remove(id); live opaque token |
| POST /api/image | multipart `file`; seller+verified, JPG/PNG/WebP ≤5MB |
| GET /api/receipt?id= | Owner/seller/admin; sellerga code yo‘q |
| GET /api/changes?since= | `{version,changed}`; global counter, entity yoki shaxsiy data yo‘q |
| GET/POST /api/notifications | Own inbox; `{id}` yoki `{all:true}` read acknowledgement |
| GET/POST /api/reports | Admin list; authenticated submit(kind,target,reason), admin resolve |
| GET/POST /api/refunds | Admin queue; mock refund; outbound live = 501 |
| GET/POST /api/account | Own JSON export; `{confirm:'DELETE'}` delete |

Checkout body: `{action:'checkout',id:productId,qty,provider:'click'|'payme'|'card',cardId?,acceptTerms:true,requestId}`. requestId 16–80 alphanumeric/hyphen; har yangi buyurtma uchun UUID, retryda o‘sha UUID. Mock response `redirect:'/mock-payment?id=...'`; native ilova o‘z Gateway ekranini ochadi. Callback tasdiqlamaguncha receiptReady/to‘langan holatga o‘tmang.

Known limits: `/api/data` boshqaruv ro‘yxati va order/reviewlar 500 tagacha; inbox 100; admin navbat 200. Katta hisoblar uchun cursor pagination hali yo‘q. Public catalog query sahifalangan, lekin ba’zi UI filterlar faqat joriy sahifaga qo‘llanadi. `/api/changes` global, yuqori yuklamada per-user revision/cursor yechimi bilan almashtirish kerak.
