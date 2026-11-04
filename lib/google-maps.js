let pending;
export function loadGoogleMaps() {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (pending) return pending;
  pending = fetch('/api/maps').then(r=>r.json()).then(({key})=>{
    if (!key) throw Error('Google Maps ulanishi hozircha sozlanmagan. Do‘kon manzili orqali yo‘nalishni ochishingiz mumkin.');
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      window.tejaMapsReady=()=>resolve(window.google.maps);
      window.gm_authFailure=()=>reject(Error('Google Maps kalitini va domen ruxsatini tekshiring.'));
      script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,callback:'tejaMapsReady',loading:'async',v:'weekly',language:document.documentElement.lang==='ru'?'ru':'uz'});
      script.onerror=()=>reject(Error('Google Maps yuklanmadi. Internet ulanishini tekshiring.'));
      document.head.appendChild(script);
      setTimeout(()=>{if(!window.google?.maps)reject(Error('Xarita yuklanish vaqti tugadi.'));},15000);
    });
  }).catch(e=>{pending=null;throw e;});
  return pending;
}
