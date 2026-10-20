import {createHmac,timingSafeEqual} from 'node:crypto';
export const BOT_URL='https://t.me/Tolbuhina_bot';
export function issueTelegramLink(id:string,secret:string,now=Date.now()){
 const encoded=Buffer.from(id.replaceAll('-',''),'hex').toString('base64url');
 if(encoded.length!==22)throw Error('Invalid lead ID');
 const expiry=Math.floor(now/1000+7*86400).toString(16).padStart(8,'0');
 const payload=encoded+expiry;
 const signature=createHmac('sha256',secret).update('telegram-link:'+payload).digest().subarray(0,16).toString('base64url');
 return `${BOT_URL}?start=lead_${payload}${signature}`;
}
export function verifyTelegramLink(value:string,secret:string,now=Date.now()):string|null{
 if(!/^lead_[A-Za-z0-9_-]{52}$/.test(value)||!secret)return null;
 const payload=value.slice(5,35);const signature=Buffer.from(value.slice(35),'base64url');
 const expected=createHmac('sha256',secret).update('telegram-link:'+payload).digest().subarray(0,16);
 if(signature.length!==expected.length||!timingSafeEqual(signature,expected))return null;
 if(parseInt(payload.slice(22),16)*1000<=now)return null;
 const hex=Buffer.from(payload.slice(0,22),'base64url').toString('hex');if(hex.length!==32)return null;
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
