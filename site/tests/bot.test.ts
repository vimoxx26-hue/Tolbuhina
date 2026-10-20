import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBotFlow,type Action,type Update} from '../bot/flow';
import {createTelegram,TelegramError} from '../bot/telegram';
const user={id:123,username:'test_person'};
let updateId=1;
const message=(text:string):Update=>({update_id:updateId++,message:{message_id:updateId,chat:{id:user.id,type:'private'},from:user,text}});
function callback(actions:Action[],label:string):Update{
 const q=[...actions].reverse().find(a=>(a.payload.reply_markup as {inline_keyboard?:unknown})?.inline_keyboard);
 assert.ok(q,'keyboard missing');
 const rows=(q.payload.reply_markup as {inline_keyboard:{text:string;callback_data:string}[][]}).inline_keyboard;
 const button=rows.flat().find(b=>b.text.includes(label));assert.ok(button,`button missing: ${label}`);
 return {update_id:updateId++,callback_query:{id:'cb'+updateId,from:user,data:button.callback_data,message:{message_id:updateId,chat:{id:user.id,type:'private'}}}};
}
async function reachConsent(bot:ReturnType<typeof createBotFlow>,safety='Ничего из перечисленного'){
 let a=await bot.handle(message('/start'));a=await bot.handle(callback(a,'Энергия'));a=await bot.handle(callback(a,'Далее'));
 a=await bot.handle(callback(a,'Разнообразное'));a=await bot.handle(callback(a,'Мало движения'));await bot.handle(callback(a,safety));
 await bot.handle(message('Тестовый посетитель'));
 const forged=message('');forged.message!.contact={phone_number:'+79991234567',user_id:999};
 assert.match(JSON.stringify(await bot.handle(forged)),/Чужие контакты/);
 const own=message('');own.message!.contact={phone_number:'+79991234567',user_id:user.id};return bot.handle(own);
}
test('bot saves registration only after consent, then provides real program without forwarding health answers',async()=>{
 const rows:unknown[]=[];const bot=createBotFlow({owner:'Виталий',contact:'@Vimoxx26',persist:async row=>{rows.push(row)}});
 const consent=await reachConsent(bot);assert.equal(rows.length,0);
 const result=await bot.handle(callback(consent,'Согласен'));
 assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0] as object).sort(),['consent','consent_version','name','page','phone','telegram','utm']);
 assert.match(JSON.stringify(result),/Ваш план заботы о себе/);assert.match(JSON.stringify(result),/Магний Хелат/);assert.equal(bot.sessionCount(),0);
 await bot.handle(callback(consent,'Согласен'));assert.equal(rows.length,1,'repeated callback must not duplicate registration');
});
test('bot refuses stale buttons and never releases result on persistence failure; retry succeeds',async()=>{
 let fail=true;let saved=0;const bot=createBotFlow({owner:'Виталий',contact:'@Vimoxx26',persist:async()=>{if(fail)throw Error('DB unavailable');saved++}});
 const initial=await bot.handle(message('/start'));const stale=callback(initial,'Энергия');await bot.handle(stale);
 assert.match(JSON.stringify(await bot.handle(stale)),/неактуален/);
 const consent=await reachConsent(bot);const failed=await bot.handle(callback(consent,'Согласен'));
 assert.match(JSON.stringify(failed),/Не удалось сохранить/);assert.doesNotMatch(JSON.stringify(failed),/Ваш план заботы/);assert.equal(saved,0);
 fail=false;await bot.handle(callback(consent,'Согласен'));assert.equal(saved,1);
});
test('restricted bot outcome has no products; refusal, expiration, cancellation and groups do not register',async()=>{
 let saved=0;let clock=0;const bot=createBotFlow({owner:'Виталий',contact:'@Vimoxx26',now:()=>clock,persist:async()=>{saved++}});
 let a=await reachConsent(bot,'Принимаю лекарства');const r=await bot.handle(callback(a,'Согласен'));
 assert.match(JSON.stringify(r),/Сначала проверьте/);assert.doesNotMatch(JSON.stringify(r),/naturessunshine.ru\/catalog/);assert.equal(saved,1);
 a=await reachConsent(bot);await bot.handle(callback(a,'Не согласен'));assert.equal(saved,1);assert.equal(bot.sessionCount(),0);
 await bot.handle(message('/start'));clock=31*60*1000;assert.match(JSON.stringify(await bot.handle(message('Анна'))),/Начните тест/);
 await bot.handle(message('/start'));await bot.handle(message('/cancel'));assert.equal(bot.sessionCount(),0);
 const group=message('/start');group.message!.chat.type='group';await bot.handle(group);assert.equal(bot.sessionCount(),0);
 const anonymous=message('/start');anonymous.message!.from={id:124};assert.match(JSON.stringify(await bot.handle(anonymous)),/username/);
});
test('Telegram transport exposes neither token nor message body in errors and checks API ok',async()=>{
 const token='123456789:abcdefghijklmnopqrstuvwxyz123456789';
 const call=createTelegram(token,async()=>{throw Error('https://api.telegram.org/bot'+token+'/sendMessage private data')});
 await assert.rejects(()=>call('sendMessage',{text:'private data'}),e=>e instanceof TelegramError&&!e.message.includes(token)&&!e.message.includes('private data'));
 const rejected=createTelegram(token,async()=>Response.json({ok:false,error_code:429,parameters:{retry_after:15}}));
 await assert.rejects(()=>rejected('getMe'),e=>e instanceof TelegramError&&e.code===429&&e.retryAfter===15);
 const good=createTelegram(token,async()=>Response.json({ok:true,result:{username:'test_bot'}}));assert.deepEqual(await good('getMe'),{username:'test_bot'});
});
