# MongoDB setup

The application uses MongoDB as its database. It starts with a fresh database; existing data is not automatically imported.

## Local development

1. Install Node.js 22.x and MongoDB Community Server, or create an Atlas cluster.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` in `.env`, using a database path such as:

   ```dotenv
   MONGODB_URI=mongodb://127.0.0.1:27017/teja?replicaSet=rs0
   ```

4. Run `npm ci`, then `npm run dev`.

The first database connection creates the required indexes. Multi-document operations require a MongoDB replica set or `mongos`; Atlas clusters provide transaction support. A standalone local MongoDB server is not sufficient. For local Community Server, start `mongod` with `--replSet rs0`, then initialize the set once with `mongosh --eval "rs.initiate()"`.

## Vercel

Set `MONGODB_URI` in **Project → Settings → Environment Variables** for each environment you deploy, then redeploy. Use the Atlas driver URI with `/teja` as its database path. Do not commit the URI or share it in chat. See [DEPLOY.md](./DEPLOY.md) for the Vercel steps and health check.

`/api/mongo-health` must return HTTP 200 with both `"ok": true` and `"transactionsSupported": true`. A standalone MongoDB connection returns HTTP 503 because checkout and payment operations depend on transactions.

`MONGODB_URI` is the only database connection setting.
