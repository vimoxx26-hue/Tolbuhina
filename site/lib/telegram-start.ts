import {registrationSecret} from './storage';
import {verifyTelegramLink} from './telegram-link';
import {markTelegramStarted} from './telegram-tracking';
import type {createTelegram} from './telegram-api';
type StartUpdate={message?:{text?:string;chat?:{id:number;type:string};from?:{id:number;username?:string}}};
export async function handleTelegramStart(update:StartUpdate,api:ReturnType<typeof createTelegram>):Promise<boolean>{
 const m=update.message;if(m?.chat?.type!=='private'||!m.from||!m.text)return false;
 const match=/^\/start\s+(lead_[A-Za-z0-9_-]+)$/.exec(m.text.trim());if(!match)return false;
 const secret=registrationSecret();const id=secret?verifyTelegramLink(match[1],secret):null;
 let text='Ссылка недействительна или устарела. Вернитесь на сайт, пройдите тест и используйте новую ссылку.';
 if(id){
  try{const linked=await markTelegramStarted(id,{id:m.from.id,chatId:m.chat.id,username:m.from.username});
   text=linked?'Вы запустили бота — связь с вашей заявкой подтверждена. Программа остаётся на странице сайта. Для вопросов: @Vimoxx26.':'Не удалось связать аккаунт с заявкой. Откройте ссылку с того аккаунта Telegram, который указан в форме; проверьте username в настройках.';
  }catch{console.error('TELEGRAM_TRACKING_UNAVAILABLE: check tracking migration and database configuration');throw new Error('Tracking unavailable');}
 }
 await api('sendMessage',{chat_id:m.chat.id,text,link_preview_options:{is_disabled:true}});return true;
}
