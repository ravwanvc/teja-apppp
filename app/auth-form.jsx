"use client";
import Link from 'next/link';
import {useState} from 'react';
import {useLanguage,LanguageSwitcher} from './language';
import ThemeSwitcher from './theme-switcher';
export default function AuthForm({mode}) {
 const {lang}=useLanguage(),t=(u,r)=>lang==='ru'?r:u;
 const [action,A]=useState(mode==='register'?'register':'login'),[phone,P]=useState(''),[error,E]=useState(''),[busy,B]=useState(false);
 async function submit(e){e.preventDefault();B(true);E('');const f=new FormData(e.currentTarget);try{
  const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,phone:'+998'+phone,password:f.get('password'),confirmPassword:f.get('confirmPassword'),recoveryCode:f.get('recoveryCode'),name:[f.get('name'),f.get('surname')].filter(Boolean).join(' '),role:f.get('role')||'member'})});
  const d=await r.json();if(!r.ok)throw Error(d.error||t('Kirish amalga oshmadi','Не удалось войти'));
  location.assign(d.redirect||'/');
 }catch(e){E(e.message==='Failed to fetch'?t('Aloqa uzildi. Internetni tekshirib, qayta urinib ko‘ring.','Нет соединения. Проверьте интернет и повторите.'):e.message);}finally{B(false);}}
 function change(a){A(a);E('');}
 return <main className="auth-shell"><aside className="auth-story"><Link href="/" className="brand">teja.</Link><span className="eyebrow">{t('YAXSHI OVQAT. YAXSHI ODAT.','ХОРОШАЯ ЕДА. ПОЛЕЗНАЯ ПРИВЫЧКА.')}</span><h1>{t('Har kuni mazali.','Вкусно каждый день.')}<br/>{t('Har kuni tejam.','Выгодно каждый день.')}</h1><p>{t('Yaqiningizdagi yaxshi mahsulotlarni qulay narxda toping.','Находите хорошие продукты рядом по выгодной цене.')}</p><img src="/hero.svg" alt=""/></aside><section className="auth-card"><div className="section-head"><Link href="/">← {t('Takliflar','Предложения')}</Link><div className="header-controls"><LanguageSwitcher/><ThemeSwitcher/></div></div>
 <h2>{action==='reset'?t('Parolni tiklash','Восстановление пароля'):action==='register'?t('Hisob yaratish','Создать аккаунт'):t('Xush kelibsiz!','С возвращением!')}</h2>{action!=='reset'&&<div className="auth-tabs"><button className={action==='login'?'active':'secondary'} onClick={()=>change('login')}>{t('Kirish','Вход')}</button><button className={action==='register'?'active':'secondary'} onClick={()=>change('register')}>{t('Ro‘yxatdan o‘tish','Регистрация')}</button></div>}
 <form onSubmit={submit}>{action==='register'&&<><div className="form-grid"><label>{t('Ism','Имя')}<input name="name" required minLength={2} maxLength={38} autoComplete="given-name"/></label><label>{t('Familiya','Фамилия')}<input name="surname" required minLength={2} maxLength={38} autoComplete="family-name"/></label></div><label>{t('Hisob turi','Тип аккаунта')}<select name="role"><option value="member">{t('Xaridor','Покупатель')}</option><option value="seller">{t('Sotuvchi','Продавец')}</option></select></label></>}
 <label>{t('Telefon raqami','Номер телефона')}<div className="phone-field"><span>+998</span><input type="tel" name="phone" value={phone} onChange={e=>P(e.target.value.replace(/\D/g,'').slice(0,9))} required pattern="[0-9]{9}" autoComplete="tel-national" placeholder="90 123 45 67"/></div></label>
 {action==='reset'&&<><p>{t('Ro‘yxatdan o‘tishda yoki Hisobim bo‘limida olgan tiklash kalitini kiriting. Kalit bo‘lmasa, sayt ma’muriga murojaat qiling.','Введите ключ, полученный при регистрации или в аккаунте. Если ключа нет, обратитесь к администратору.')}</p><label>{t('Tiklash kaliti','Ключ восстановления')}<input name="recoveryCode" required autoComplete="off" placeholder="TEJA-..."/></label></>}
 <label>{action==='reset'?t('Yangi parol','Новый пароль'):t('Parol','Пароль')}<input name="password" type="password" minLength={8} maxLength={128} required autoComplete={action==='login'?'current-password':'new-password'}/></label>
 {action==='reset'&&<label>{t('Parolni takrorlang','Повторите пароль')}<input name="confirmPassword" type="password" minLength={8} maxLength={128} required autoComplete="new-password"/></label>}
 {error&&<p role="alert" className="error-box">{error}</p>}<button className="full" disabled={busy}>{busy?t('Kuting…','Подождите…'):action==='reset'?t('Parolni saqlash','Сохранить пароль'):action==='register'?t('Hisob yaratish','Создать аккаунт'):t('Kirish','Войти')}</button></form>
 <button className="text-button" onClick={()=>change(action==='reset'?'login':'reset')}>{action==='reset'?t('Kirishga qaytish','Вернуться ко входу'):t('Parolni unutdingizmi?','Забыли пароль?')}</button>
 </section></main>;
}
