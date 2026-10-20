import {validWebhookSecret} from '@/lib/telegram-webhook-auth';
import {createTelegram} from '@/lib/telegram-api';
import {readSmallJson,validOrigin,rateLimited} from '@/lib/request';
export async function POST(request:Request){
 if(!validOrigin(request))return Response.json({error:'Откройте страницу на основном адресе сайта'},{status:403});
 if(rateLimited(request,'telegram-connect',5))return Response.json({error:'Слишком много попыток, попробуйте позже'},{status:429});
 let body;try{body=await readSmallJson(request)}catch{return Response.json({error:'Некорректный запрос'},{status:400})}
 if(typeof body?.secret!=='string'||!validWebhookSecret(body.secret))return Response.json({error:'Проверьте TELEGRAM_WEBHOOK_SECRET: значение должно совпадать с настройкой Vercel и содержать не менее 32 символов'},{status:403});
 const raw=process.env.SITE_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:'');
 let url;try{url=new URL('/api/telegram/webhook',raw);if(url.protocol!=='https:')throw Error()}catch{return Response.json({error:'Задайте SITE_URL: основной HTTPS-адрес сайта'},{status:503})}
 if(!process.env.TELEGRAM_BOT_TOKEN)return Response.json({error:'Добавьте TELEGRAM_BOT_TOKEN в Vercel'},{status:503});
 try{
  const api=createTelegram(process.env.TELEGRAM_BOT_TOKEN);
  const existing=await api<{url:string}>('getWebhookInfo');
  if(existing.url&&existing.url!==url.href)return Response.json({error:'У бота уже другое подключение. Сначала согласуйте его перенос; оно не было изменено'},{status:409});
  const me=await api<{username:string}>('getMe');
  if(me.username.toLowerCase()!=='tolbuhina_bot')return Response.json({error:'Токен принадлежит другому боту. Нужен @Tolbuhina_bot'},{status:409});
  await api('setWebhook',{url:url.href,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message'],drop_pending_updates:false});
  return Response.json({ok:true,message:'Бот подключён. Теперь пройдите тест, перейдите в Telegram и нажмите Start.'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Telegram не подтвердил подключение. Проверьте токен и доступность сервиса'},{status:503})}
}
