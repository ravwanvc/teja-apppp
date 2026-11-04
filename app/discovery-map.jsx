"use client";
import {useEffect,useRef,useState} from 'react';
import {MapPin,Navigation,ArrowUpRight,Search,LocateFixed} from 'lucide-react';
import {loadGoogleMaps} from '../lib/google-maps';
import {googleEmbedUrl,googleRouteUrl,validPoint} from '../lib/map-embed';
import {money} from '../lib/format';
import {distanceKm} from '../lib/map-discovery';
import {useLanguage} from './language';
export default function DiscoveryMap({products,location,onLocate,locating,onOpen}){
 const ref=useRef(null),mapRef=useRef(null),[mode,Mode]=useState('loading'),[radius,R]=useState(0),[query,Q]=useState(''),[selected,S]=useState(''),{lang}=useLanguage();
 const t=(uz,ru)=>lang==='ru'?ru:uz;
 const list=products.filter(p=>validPoint(p)&&(!radius||!location||distanceKm(location,p)<=radius)&&`${p.title} ${p.shop} ${p.address}`.toLowerCase().includes(query.toLowerCase()));
 const current=list.find(p=>p.id===selected)||list[0];
 const signature=JSON.stringify(list.map(p=>[p.id,p.price,p.lat,p.lng]));
 useEffect(()=>{let disposed=false,markers=[];loadGoogleMaps().then(g=>{
 if(disposed)return;const map=new g.Map(ref.current,{center:location||{lat:41.3111,lng:69.2797},zoom:12,mapTypeControl:false,streetViewControl:false,clickableIcons:false,styles:[{featureType:'poi',stylers:[{visibility:'off'}]}]});mapRef.current=map;
 const bounds=new g.LatLngBounds();list.forEach(p=>{const position={lat:Number(p.lat),lng:Number(p.lng)};
 const marker=new g.Marker({map,position,title:p.shop+' · '+p.title,label:{text:money(p.price),color:'#155b42',fontWeight:'700'}});marker.addListener('click',()=>S(p.id));markers.push(marker);bounds.extend(position);});
 if(location){markers.push(new g.Marker({map,position:location,title:t('Siz shu yerdasiz','Вы здесь')}));bounds.extend(location);}if(!bounds.isEmpty()){map.fitBounds(bounds,65);g.event.addListenerOnce(map,'idle',()=>{if(map.getZoom()>16)map.setZoom(16);});}Mode('interactive');
 }).catch(()=>{if(!disposed)Mode('embed');});return()=>{disposed=true;markers.forEach(m=>m.setMap(null));mapRef.current=null;};},[signature,location,lang]);
 useEffect(()=>{if(current&&mapRef.current){mapRef.current.panTo({lat:Number(current.lat),lng:Number(current.lng)});}},[current?.id]);
 return <section className="discovery"><div className="section-head"><div><div className="eyebrow">TEJA / {t('YAQININGIZDA','РЯДОМ С ВАМИ')}</div><h1>{t('Yaqinroq. Mazaliroq. Arzonroq.','Ближе. Вкуснее. Выгоднее.')}</h1><p>{t('Do‘konni xaritada tanlang va olib ketishni rejalang.','Выберите магазин на карте и спланируйте получение.')}</p></div><button onClick={onLocate} disabled={locating}><LocateFixed size={16}/>{locating?t('Aniqlanmoqda…','Определяем…'):t('Joylashuvim','Моё местоположение')}</button></div>
 <div className="map-toolbar"><label className="map-search"><Search size={18}/><input aria-label={t('Xaritadan qidirish','Поиск на карте')} placeholder={t('Do‘kon, taom yoki manzil…','Магазин, блюдо или адрес…')} value={query} onChange={e=>Q(e.target.value)}/></label><label>{t('Masofa','Расстояние')}<select value={radius} disabled={!location} onChange={e=>R(Number(e.target.value))}><option value="0">{t('Barchasi','Все')}</option>{[1,3,5,10].map(k=><option key={k} value={k}>{k} km</option>)}</select></label><span className="map-count">{list.length} {t('ta taklif','предложений')}</span></div>
 <div className="discovery-layout"><aside className="map-results">{!list.length&&<div className="empty"><MapPin/><h3>{t('Bu hududda taklif topilmadi','Предложения не найдены')}</h3><button className="secondary" onClick={()=>{Q('');R(0);}}>{t('Filtrni tozalash','Сбросить фильтры')}</button></div>}{list.map(p=><button key={p.id} aria-pressed={current?.id===p.id} className={'map-offer '+(current?.id===p.id?'chosen':'')} onClick={()=>S(p.id)}><img src={p.image} alt=""/><span><small>{p.shop}</small><b>{p.title}</b><strong>{money(p.price)} <del>{money(p.original)}</del></strong><small><MapPin size={12}/>{p.address}</small>{location&&<small>{distanceKm(location,p).toFixed(1)} km</small>}</span></button>)}</aside><div className="discovery-map-wrap"><div ref={ref} className="discovery-map" style={{visibility:mode==='interactive'?'visible':'hidden'}}/>{mode!=='interactive'&&<iframe className="google-map-embed" title="Google Maps — TEJA" src={googleEmbedUrl(current||location,lang,current?15:12)} allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}<span className="map-mode-label">Google Maps · {mode==='interactive'?t('Barcha takliflar','Все предложения'):t('Tanlangan manzil','Выбранный адрес')}</span></div></div>
 {current&&<article className="map-selection"><img src={current.image} alt=""/><div><small>{current.shop}</small><h3>{current.title}</h3><p><MapPin size={14}/>{current.address}</p></div><strong>{money(current.price)}</strong><div className="map-selection-actions"><a className="secondary" href={googleRouteUrl(current)} target="_blank" rel="noreferrer"><Navigation size={16}/>{t('Yo‘lni ko‘rish','Маршрут')}</a><button onClick={()=>onOpen(current)}>{t('Taklifni ochish','Открыть предложение')}<ArrowUpRight size={16}/></button></div></article>}
 <p className="map-note">{t('Xarita internet orqali yuklanadi. Masofa to‘g‘ri chiziq bo‘yicha; yo‘l va vaqtni “Yo‘lni ko‘rish” orqali tekshiring.','Карта загружается через интернет. Расстояние указано по прямой; маршрут и время смотрите по кнопке «Маршрут».')}</p></section>;
}
