import { getMongoDb } from "./mongodb.js";

export async function pickupReminders(database, now = Date.now()) {
  const db=database?.collection?database:await getMongoDb();
  const orders=await db.collection("orders").find({
    status:"reserved",pickup_at:{$gt:now,$lte:now+1800000},
  },{projection:{id:1,buyer:1}}).toArray();
  for(const order of orders){
    const result=await db.collection("notifications").updateOne(
      {owner:order.buyer,kind:"pickup_soon",entity:order.id},
      {$setOnInsert:{id:crypto.randomUUID(),owner:order.buyer,kind:"pickup_soon",entity:order.id,created:now,read_at:null}},
      {upsert:true},
    );
    if(result.upsertedCount)await db.collection("change_version").updateOne({id:1},{$setOnInsert:{id:1},$inc:{version:1}},{upsert:true});
  }
}
export const mockPush = (notification) => ({ channel: "mock", notification });
