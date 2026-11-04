export const tashkentDay=t=>new Date(t+5*3600000).toISOString().slice(0,10);
export function panelMetrics(products,orders,days=7,now=Date.now()){
 const from=now-days*86400000,period=orders.filter(o=>Number(o.created)>=from);
 const real=period.filter(o=>o.status==='collected'&&o.provider!=='demo'&&!Number(o.is_mock));
 const revenue=real.reduce((n,o)=>n+Number(o.price)*Number(o.qty),0);
 const commission=real.reduce((n,o)=>n+(o.provider==='cash'&&o.payment_state!=='refunded'?Number(o.commission_due):o.payment_state==='paid'?Number(o.deposit):0),0);
 const series=Array.from({length:7},(_,i)=>{const day=tashkentDay(now-(6-i)*86400000);return{day,value:real.filter(o=>tashkentDay(Number(o.created))===day).reduce((n,o)=>n+o.price*o.qty,0)};});
 return {revenue,commission,net:revenue-commission,completed:real.length,total:period.length,waiting:orders.filter(o=>o.status==='reserved').length,refunds:orders.filter(o=>o.payment_state==='refund_due').reduce((n,o)=>n+Number(o.deposit),0),low:products.filter(p=>p.active&&p.stock>0&&p.stock<=3&&p.until>now).length,ending:products.filter(p=>p.active&&p.stock>0&&p.until>now&&p.until<=now+7200000).length,active:products.filter(p=>p.active&&p.stock>0&&p.until>now&&['approved','legacy'].includes(p.image_status)).length,series};
}
