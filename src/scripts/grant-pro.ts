import { MongoClient } from "mongodb";

const userId = process.argv[2];
if (!userId) {
  console.error("uso: yarn grant:pro <userId>");
  process.exit(1);
}

const uri = process.env.MONGODB_URI!
  .replace("<username>", process.env.MONGODB_USERNAME!)
  .replace("<password>", process.env.MONGODB_PASSWORD!);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME);
const r = await db.collection("entitlements").updateOne(
  { userId },
  { $set: { plan: "pro", source: "admin", updatedAt: new Date() } },
  { upsert: true },
);
console.log(`PRO granted para ${userId}:`, JSON.stringify(r));
await client.close();
