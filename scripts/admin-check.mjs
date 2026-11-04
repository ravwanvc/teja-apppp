import {readLocalEnv} from './local-env.mjs';
import {phoneNumber} from '../lib/password.js';
const e=readLocalEnv();const phone=!!phoneNumber(e.ADMIN_PHONE),hash=/^pbkdf2:100000:[a-f0-9]{32}:[a-f0-9]{64}$/.test(e.ADMIN_PASSWORD_HASH||'');console.log('Admin telefoni: '+(phone?'to‘g‘ri':'yo‘q yoki noto‘g‘ri'));console.log('Admin parol xeshi: '+(hash?'to‘g‘ri':'yo‘q yoki noto‘g‘ri'));if(!phone||!hash){console.log('Sozlash: npm run admin:setup');process.exitCode=1}else console.log('Sozlamalar tayyor. Server qayta ishga tushgach /login dan kiring.');
