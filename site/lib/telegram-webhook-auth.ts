import {timingSafeEqual} from 'node:crypto';
export function validWebhookSecret(value:string|null){
 const expected=process.env.TELEGRAM_WEBHOOK_SECRET;
 if(!expected||!/^[A-Za-z0-9_-]{32,256}$/.test(expected)||!value)return false;
 const a=Buffer.from(value);const b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
