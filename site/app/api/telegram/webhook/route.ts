import {validWebhookSecret} from '@/lib/telegram-webhook-auth';
import {createTelegram} from '@/lib/telegram-api';
import {handleTelegramStart} from '@/lib/telegram-start';
import {readSmallJson} from '@/lib/request';
export async function POST(request:Request){
 if(!validWebhookSecret(request.headers.get('x-telegram-bot-api-secret-token')))return Response.json({error:'Forbidden'},{status:403});
 if(!process.env.TELEGRAM_BOT_TOKEN)return Response.json({error:'Bot unavailable'},{status:503});
 let update;try{update=await readSmallJson(request)}catch{return Response.json({error:'Invalid update'},{status:400})}
 try{
  const api=createTelegram(process.env.TELEGRAM_BOT_TOKEN);
  if(!await handleTelegramStart(update,api)){
   const m=update?.message;
   if(m?.chat?.type==='private'&&Number.isSafeInteger(m.chat.id)&&m.from?.id===m.chat.id){
    let text='Здравствуйте! Чтобы связать запуск бота с заявкой, перейдите сюда по кнопке после прохождения теста на сайте.';
    if(m.text==='/id')text=`Ваш chat_id: ${m.chat.id}`;
    else if(m.text==='/privacy')text=`Контакт владельца: ${process.env.SITE_OWNER_CONTACT||'@Vimoxx26'}. Запуск по индивидуальной ссылке сохраняет Telegram ID и дату связи с вашей заявкой. Ответы теста не передаются. Для удаления данных обратитесь к владельцу.`;
    else if(!/^\/start(?:\s|$)/.test(m.text||''))return Response.json({ok:true});
    await api('sendMessage',{chat_id:m.chat.id,text});
   }
  }
  return Response.json({ok:true});
 }catch{console.error('TELEGRAM_WEBHOOK_DELIVERY_FAILED');return Response.json({error:'Temporary failure'},{status:503})}
}
