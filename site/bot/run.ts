import {handleTelegramStart} from '../lib/telegram-start';
import {loadEnvFile} from 'node:process';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createTelegram,TelegramError} from './telegram';
import {createBotFlow,type Update} from './flow';
import {persistLead,storageConfigured} from '../lib/storage';
try{loadEnvFile('.env.local');}catch{/* Hosting may inject all settings. */}
async function main(){
 const api=createTelegram(process.env.TELEGRAM_BOT_TOKEN||'');
 const me=await api<{username:string}>('getMe');
 const webhook=await api<{url:string}>('getWebhookInfo');
 if(!storageConfigured()||!process.env.SITE_OWNER_NAME||!process.env.SITE_OWNER_CONTACT)throw new Error('Configure private storage and owner details before starting the bot');
 if(webhook.url)throw new Error('This bot already has an active webhook. Polling was not started; use a separate bot or migrate its existing deployment first');
 console.log(`Bot verified: @${me.username}. Storage configured. Notifications: ${process.env.TELEGRAM_CHAT_ID?'configured':'not configured'}.`);
 if(process.argv.includes('--check'))return;
 const offsetPath=resolve(dirname(process.env.LEAD_DB_PATH||resolve('../.data/leads.sqlite')),'telegram-offset.json');
 mkdirSync(dirname(offsetPath),{recursive:true,mode:0o700});chmodSync(dirname(offsetPath),0o700);
 let offset=0;
 if(existsSync(offsetPath)){const parsed=JSON.parse(readFileSync(offsetPath,'utf8'));if(Number.isSafeInteger(parsed.offset)&&parsed.offset>=0)offset=parsed.offset;else throw new Error('Invalid polling offset file');}
 function saveOffset(value:number){const temp=offsetPath+'.tmp';writeFileSync(temp,JSON.stringify({offset:value}),{mode:0o600});chmodSync(temp,0o600);renameSync(temp,offsetPath);offset=value;}
 const flow=createBotFlow({owner:process.env.SITE_OWNER_NAME,contact:process.env.SITE_OWNER_CONTACT,persist:async lead=>{
  await persistLead(lead);
  if(process.env.TELEGRAM_CHAT_ID){try{await api('sendMessage',{chat_id:process.env.TELEGRAM_CHAT_ID,text:`Новая регистрация из бота\nИмя: ${lead.name}\nТелефон: ${lead.phone}\nTelegram: ${lead.telegram}`});}catch{console.warn('Registration saved; owner notification unavailable');}}
 }});
 let running=true;process.on('SIGINT',()=>{running=false});process.on('SIGTERM',()=>{running=false});
 const counts=new Map<number,{count:number;until:number}>();
 console.log('Polling started. One polling process per bot. /id shows your own chat ID.');
 while(running){
  try{
   const updates=await api<Update[]>('getUpdates',{offset,timeout:25,limit:25,allowed_updates:['message','callback_query']});
   for(const update of updates){
    if(!running)break;
    const chat=update.message?.chat||update.callback_query?.message?.chat;
    if(update.callback_query){try{await api('answerCallbackQuery',{callback_query_id:update.callback_query.id})}catch{/* Expired callback; still process valid state. */}}
    const time=Date.now();for(const [id,v] of counts)if(v.until<=time)counts.delete(id);
    if(chat){const current=counts.get(chat.id)||{count:0,until:time+60000};current.count++;if(counts.size<10000||counts.has(chat.id))counts.set(chat.id,current);if(current.count>35||counts.size>=10000){saveOffset(update.update_id+1);continue}}
    if(await handleTelegramStart(update,api)){saveOffset(update.update_id+1);continue;}
    if(chat?.type==='private'&&update.message?.text==='/id'){await api('sendMessage',{chat_id:chat.id,text:`Ваш chat_id: ${chat.id}\nВладелец может указать его в TELEGRAM_CHAT_ID, чтобы получать регистрации.`});}
    else for(const action of await flow.handle(update)){if(action.method!=='answerCallbackQuery')await api(action.method,action.payload);}
    saveOffset(update.update_id+1);
   }
  }catch(error){
   if(error instanceof TelegramError&&(error.code===401||error.code===409))throw new Error(error.code===401?'Bot token rejected; update it privately':'Another bot process or webhook is active; stop the duplicate process');
   console.warn(error instanceof TelegramError?`Telegram temporarily unavailable (${error.code}); retrying`:'Bot operation failed; retrying without logging message contents');
   await new Promise(r=>setTimeout(r,error instanceof TelegramError&&error.retryAfter?error.retryAfter*1000:3000));
  }
 }
}
main().catch(error=>{console.error(error instanceof TelegramError?`Telegram check failed (${error.code}); verify token and network privately`:error instanceof Error?error.message:'Bot startup failed');process.exitCode=1});
