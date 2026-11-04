// Extension contract only. No unsupported live provider endpoint is guessed.
// Implement with merchant-specific documentation, authenticated credentials,
// idempotency and receipt reconciliation before enabling public live checkout.
export async function requestProviderRefund(adapter,order){
 if(!adapter||typeof adapter.refund!=='function'||typeof adapter.lookup!=='function')throw Error('Refund adapter configured emas');
 const key='refund:'+order.id;
 const known=await adapter.lookup(key);
 if(known?.status==='refunded')return known;
 if(known?.status==='pending')return known;
 return adapter.refund({idempotencyKey:key,orderId:order.id,transactionId:order.transaction_id,amount:order.deposit,currency:'UZS'});
}
