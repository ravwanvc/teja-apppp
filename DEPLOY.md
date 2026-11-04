# Vercel deployment

This is a server-rendered Next.js application. Do not deploy it as a static export.

## 1. Prepare MongoDB Atlas

1. Create an Atlas cluster and a database user with a strong password.
2. In Network Access, allow Vercel to connect. Atlas cannot use a fixed Vercel IP allowlist for serverless functions; `0.0.0.0/0` is the common option. Protect the cluster with a unique, least-privilege database user and strong credentials.
3. Copy the Atlas driver URI and include the database name `teja` in its path, for example `mongodb+srv://...mongodb.net/teja?...`. URL-encode special characters in the username or password.
4. Do not send the URI or database password in chat, screenshots, or source control.

## 2. Deploy on Vercel

1. Push this project to a Git repository and import it in Vercel as a Next.js project. Keep the project root as the Root Directory.
2. Use Node.js 22.x, `npm ci` to install, and `npm run build` to build. Keep the default Next.js output settings.
3. In **Settings → Environment Variables**, set:
   - `MONGODB_URI` — the Atlas URI from step 1. This is the only database connection setting.
   - `ADMIN_PHONE` and `ADMIN_PASSWORD_HASH` — admin login configuration. Generate the hash locally with `npm run admin:setup`; never put a plain-text password in the hash field.
   - `PUBLIC_SITE_URL` — the deployed HTTPS origin.
   - Optional: `GEMINI_API_KEY`, `GEMINI_MODEL`, and `GOOGLE_MAPS_BROWSER_KEY`.
4. Redeploy after adding or changing environment variables.

The application creates MongoDB indexes when it first connects at runtime; no database build step is required. The database starts fresh. Existing local data is not imported.

## 3. Verify

- Open `https://YOUR-SITE.vercel.app/api/mongo-health`; expect HTTP 200 with `ok: true` and `transactionsSupported: true`. Checkout requires Atlas transaction support; a standalone MongoDB server is insufficient.
- Register and sign in, create a listing, then exercise a test checkout and its order/receipt flow.
- If health reports `MONGODB_URI sozlanmagan`, add that variable to the Vercel Production environment and redeploy. If connection fails, verify the URI, database user, password encoding, and Atlas Network Access settings in Vercel runtime logs.

The repository is prepared for Vercel, but a deployment must still be initiated in your Vercel account. Never commit `.env` or paste database credentials into chat.
