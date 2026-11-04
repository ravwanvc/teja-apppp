export function validPoint(point) {
  if (point?.lat == null || point?.lng == null || point.lat === '' || point.lng === '') return false;
  return Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)) && Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
}
// Public Google Maps embedded view. Full application markers use Maps JS when configured.
export function googleEmbedUrl(point, lang = 'uz', zoom = 15) {
  const query = validPoint(point) ? `${Number(point.lat)},${Number(point.lng)}` : 'Tashkent Uzbekistan';
  return 'https://maps.google.com/maps?' + new URLSearchParams({q:query,hl:lang === 'ru'?'ru':'uz',z:String(zoom),output:'embed'});
}
export function googleRouteUrl(point) {
  return 'https://www.google.com/maps/dir/?' + new URLSearchParams({api:'1',destination:validPoint(point)?`${Number(point.lat)},${Number(point.lng)}`:point?.address||'Tashkent Uzbekistan',travelmode:'walking'});
}
