import {randomBytes} from 'node:crypto';
import {buildProgram} from '../lib/program';
import {validateLead, type Goal, type Quiz} from '../lib/validation';
import type {Lead} from '../lib/storage';
export type User={id:number;username?:string;first_name?:string};
export type Update={update_id:number;message?:{message_id:number;chat:{id:number;type:string};from?:User;text?:string;contact?:{phone_number:string;user_id?:number}};callback_query?:{id:string;from:User;data?:string;message?:{message_id:number;chat:{id:number;type:string}}}};
export type Action={method:'sendMessage'|'editMessageText'|'answerCallbackQuery';payload:Record<string,unknown>};
type Stage='goals'|'diet'|'activity'|'safety'|'name'|'contact'|'consent';
type Session={id:string;rev:number;until:number;stage:Stage;goals:Goal[];diet:string;activity:string;safety:string;name?:string;phone?:string};
const goalLabels: [Goal,string][]=[['energy','Энергия'],['sleep','Сон и спокойствие'],['digestion','Пищеварение'],['immunity','Сбалансированное питание'],['balance','Общее самочувствие']];
const options={diet:[['balanced','Разнообразное питание'],['irregular','Нерегулярное питание'],['plant','Растительный рацион'],['mixed','Другие ограничения']],activity:[['low','Мало движения'],['moderate','Прогулки и умеренная активность'],['high','Регулярные тренировки']],safety:[['minor','Мне меньше 18 лет'],['pregnant','Беременность или кормление'],['medications','Принимаю лекарства'],['condition','Хронические заболевания / аллергия'],['clear','Ничего из перечисленного']]};
const titles={diet:'2/5. Как вы обычно питаетесь?',activity:'3/5. Сколько движения в вашем дне?',safety:'4/5. Есть ли ограничения? Выберите первое подходящее. При сочетании ограничений также начните с врача.'};
export function createBotFlow(deps:{persist:(lead:Lead)=>Promise<void>;owner:string;contact:string;now?:()=>number}) {
 const sessions=new Map<number,Session>();const now=deps.now||Date.now;
 const say=(id:number,text:string,markup?:Record<string,unknown>):Action=>({method:'sendMessage',payload:{chat_id:id,text,...(markup?{reply_markup:markup}:{}),link_preview_options:{is_disabled:true}}});
 const privacy=()=>`Владелец: ${deps.owner}. Контакт: ${deps.contact}.\nИмя, номер телефона и Telegram сохраняются для регистрации и выдачи программы. Ответы теста не сохраняются в базе контактов; сообщения остаются в истории Telegram. Согласие на рекламу не запрашивается. Для удаления регистрации обратитесь к владельцу.\nДо публичного запуска владелец должен дополнить сведения об операторе и сроки хранения.`;
 function question(chat:number,s:Session,editId?:number):Action {
  let text='';let rows:{text:string;callback_data:string}[][]=[];
  const button=(value:string,label:string)=>({text:label,callback_data:`q:${s.id}:${s.rev}:${value}`});
  if(s.stage==='goals'){text='1/5. Что хотите поддержать? Выберите одно или несколько направлений и нажмите «Далее».\nВыбрано: '+(goalLabels.filter(([g])=>s.goals.includes(g)).map(([,label])=>label).join(', ')||'пока ничего');rows=goalLabels.map(([g,label])=>[button(g,(s.goals.includes(g)?'✓ ':'')+label)]);rows.push([button('next','Далее')]);}
  else if(s.stage==='diet'||s.stage==='activity'||s.stage==='safety'){text=titles[s.stage];rows=options[s.stage].map(([v,label])=>[button(v,label)]);}
  else if(s.stage==='consent'){text='5/5. Регистрация\n\n'+privacy()+'\n\nНажмите «Согласен», только если согласны на обработку имени, телефона и Telegram для регистрации. До согласия данные не сохраняются.';rows=[[button('agree','Согласен — открыть программу')],[button('decline','Не согласен')]];}
  else if(s.stage==='name')return say(chat,'5/5. Для полной программы нужна регистрация. Напишите, как к вам обращаться (от 2 до 100 символов).\nКонтакты сохранятся только после вашего согласия. /cancel — отменить.');
  else return say(chat,'Поделитесь своим телефоном кнопкой ниже. Бот принимает только ваш собственный контакт. /cancel — отменить.',{keyboard:[[{text:'Поделиться своим телефоном',request_contact:true}]],resize_keyboard:true,one_time_keyboard:true});
  const reply_markup={inline_keyboard:rows};return editId?{method:'editMessageText',payload:{chat_id:chat,message_id:editId,text,reply_markup}}:say(chat,text,reply_markup);
 }
 function results(chat:number,quiz:Quiz):Action[]{const p=buildProgram(quiz);return [say(chat,p.title+'\n\n'+p.intro,{remove_keyboard:true}),...p.steps.map((s,i)=>say(chat,`${i+1}. ${s.title}\n${s.text}`)),...(p.products.length?[say(chat,'Информация о добавках для обсуждения с врачом. Это отдельные варианты, а не список для совместного приёма.')]:[]),...p.products.map(x=>say(chat,x.name+'\n'+x.description+'\n'+x.url)),say(chat,p.caution+'\n\n/start — пройти заново. /privacy — обработка данных.')];}
 return { async handle(update:Update):Promise<Action[]> {
  for(const [id,s] of sessions)if(s.until<=now())sessions.delete(id);
  const cb=update.callback_query;const msg=update.message;const user=cb?.from||msg?.from;const chat=cb?.message?.chat||msg?.chat;
  if(!user||!chat)return [];
  const ack:Action[]=cb?[{method:'answerCallbackQuery',payload:{callback_query_id:cb.id}}]:[];
  if(chat.type!=='private')return [...ack,say(chat.id,'Пройдите тест в личном чате с ботом. Контакты в группах не собираются.')];
  const text=msg?.text?.trim()||'';
  if(text==='/privacy')return [say(chat.id,privacy())];
  if(text==='/cancel'){sessions.delete(user.id);return [say(chat.id,'Тест отменён. Незавершённые ответы и контакты удалены из памяти. /start — начать заново.',{remove_keyboard:true})];}
  if(/^\/start(?:\s|$)/.test(text)){
   if(!deps.owner||!deps.contact)return [say(chat.id,'Бот ещё настраивается. Приём регистраций пока недоступен.')];
   if(!user.username)return [say(chat.id,'Для регистрации нужен ваш Telegram username. Укажите имя пользователя в настройках Telegram и отправьте /start. Тест не будет запрашивать пароль или код входа.')];
   if(sessions.size>=5000&&!sessions.has(user.id))return [say(chat.id,'Сейчас много посетителей. Попробуйте немного позже.')];
   const s:Session={id:randomBytes(5).toString('hex'),rev:0,until:now()+30*60*1000,stage:'goals',goals:[],diet:'',activity:'',safety:''};sessions.set(user.id,s);
   return [say(chat.id,'Свой ритм. Короткий тест поможет сориентироваться в питании и добавках Nature’s Sunshine. Это не диагностика и не назначение лечения.\nПосле вопросов — регистрация: имя, ваш телефон и Telegram. /privacy — как используются данные. /cancel — остановить.',{remove_keyboard:true}),question(chat.id,s)];
  }
  const s=sessions.get(user.id);if(!s)return [...ack,say(chat.id,'Начните тест командой /start. Сессия действует 30 минут; после перезапуска бота её нужно начать заново.')];
  s.until=now()+30*60*1000;
  if(cb){
   const prefix=`q:${s.id}:${s.rev}:`;if(!cb.data?.startsWith(prefix))return [...ack,say(chat.id,'Этот вопрос уже неактуален. Используйте последнее сообщение бота или /start.')];
   const value=cb.data.slice(prefix.length);
   if(s.stage==='goals'){
    if(value==='next'){if(!s.goals.length)return [...ack,say(chat.id,'Выберите хотя бы одну цель.')];s.stage='diet';}
    else {const g=goalLabels.find(([g])=>g===value)?.[0];if(!g)return ack;s.goals=s.goals.includes(g)?s.goals.filter(x=>x!==g):[...s.goals,g];s.rev++;return [...ack,question(chat.id,s,cb.message?.message_id)];}
   }else if(s.stage==='diet'||s.stage==='activity'||s.stage==='safety'){
    if(!options[s.stage].some(([v])=>v===value))return ack;const old=s.stage;s[old]=value;s.stage=old==='diet'?'activity':old==='activity'?'safety':'name';
   }else if(s.stage==='consent'){
    if(value==='decline'){sessions.delete(user.id);return [...ack,say(chat.id,'Регистрация отменена. Контакты не сохранены. /start — начать заново.',{remove_keyboard:true})];}
    if(value!=='agree')return ack;
    const lead=validateLead({name:s.name,phone:s.phone,telegram:user.username,consent:true,page:'telegram-bot',utm:{utm_source:'telegram_bot'}});
    if(!lead)return [...ack,say(chat.id,'Не удалось проверить контакты. Укажите Telegram username в настройках и начните заново: /start.')];
    try{await deps.persist(lead);}catch{return [...ack,say(chat.id,'Не удалось сохранить регистрацию. Программа пока не открыта. Попробуйте нажать «Согласен» ещё раз позже или /cancel.')];}
    sessions.delete(user.id);return [...ack,...results(chat.id,{goals:s.goals,diet:s.diet,activity:s.activity,safety:s.safety})];
   }else return ack;
   s.rev++;return [...ack,question(chat.id,s)];
  }
  if(s.stage==='name'){
   if(text.length<2||text.length>100||/[\x00-\x1f<>]/.test(text))return [say(chat.id,'Напишите имя от 2 до 100 символов без специальных знаков.')];
   s.name=text;s.stage='contact';s.rev++;return [question(chat.id,s)];
  }
  if(s.stage==='contact'){
   if(!msg?.contact||msg.contact.user_id!==user.id)return [say(chat.id,'Нажмите «Поделиться своим телефоном». Чужие контакты и номера из текста не принимаются.')];
   const phone=msg.contact.phone_number.replace(/[\s()-]/g,'');if(!/^\+?[1-9]\d{9,14}$/.test(phone))return [say(chat.id,'Не удалось распознать номер с кодом страны. Попробуйте ещё раз или /cancel.')];
   s.phone=phone;s.stage='consent';s.rev++;return [say(chat.id,'Телефон получен. Осталось ваше согласие на регистрацию.',{remove_keyboard:true}),question(chat.id,s)];
  }
  return [say(chat.id,'Выберите вариант кнопкой в последнем вопросе. /cancel — остановить тест.')];
 }, sessionCount:()=>sessions.size};
}
