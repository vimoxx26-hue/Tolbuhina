import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {issueTelegramLink,verifyTelegramLink} from '../lib/telegram-link';
import {persistLead} from '../lib/storage';
import {markTelegramStarted} from '../lib/telegram-tracking';
import {POST as webhook} from '../app/api/telegram/webhook/route';
import {POST as connect} from '../app/api/telegram/connect/route';
const secret='separate-random-secret-for-tests-32-characters';
const lead={name:'Test Person',phone:'+79991234567',telegram:'@test_person',consent:true,consent_version:'2026-10-20',page:'test',utm:{}};
function restore(saved:NodeJS.ProcessEnv){for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved)}
test('Telegram deep link fits 64 bytes, contains no contacts, rejects tampering and expires',()=>{
 const id=randomUUID();const url=new URL(issueTelegramLink(id,secret,100000));const payload=url.searchParams.get('start')!;
 assert.ok(payload.length<=64);assert.match(payload,/^[A-Za-z0-9_-]+$/);assert.equal(verifyTelegramLink(payload,secret,100000),id);
 assert.equal(verifyTelegramLink(payload,secret+'wrong',100000),null);assert.equal(verifyTelegramLink(payload+'x',secret,100000),null);assert.equal(verifyTelegramLink(payload,secret,100000+8*86400000),null);
 assert.ok(!url.href.includes('phone')&&!url.href.includes('test_person'));
});
test('tracking binds actual start to existing lead, matches username and cannot be reassigned or duplicated',async()=>{
 const saved={...process.env};const dir=mkdtempSync(join(tmpdir(),'tg-link-'));const path=join(dir,'private','leads.sqlite');
 try{Object.assign(process.env,{LEAD_STORAGE:'sqlite',LEAD_DB_PATH:path});const id=randomUUID();await persistLead(lead,id);
  assert.equal(await markTelegramStarted(id,{id:100,chatId:100,username:'wrong_user'}),false);
  assert.equal(await markTelegramStarted(id,{id:100,chatId:100,username:'TEST_PERSON'}),true);
  assert.equal(await markTelegramStarted(id,{id:100,chatId:100,username:'test_person'}),true);
  assert.equal(await markTelegramStarted(id,{id:200,chatId:200,username:'test_person'}),false);
  const db=new DatabaseSync(path);const rows=db.prepare('SELECT * FROM telegram_starts').all();assert.equal(rows.length,1);assert.equal(rows[0].lead_id,id);assert.equal(rows[0].telegram_user_id,'100');assert.ok(rows[0].telegram_started_at);db.close();
 }finally{restore(saved);rmSync(dir,{recursive:true,force:true})}
});
test('authenticated webhook records Start and replies, untrusted webhook cannot change database',async()=>{
 const saved={...process.env};const original=globalThis.fetch;const dir=mkdtempSync(join(tmpdir(),'tg-webhook-'));const path=join(dir,'private','leads.sqlite');const notifications:unknown[]=[];
 try{Object.assign(process.env,{LEAD_STORAGE:'sqlite',LEAD_DB_PATH:path,REGISTRATION_SECRET:secret,TELEGRAM_WEBHOOK_SECRET:secret,TELEGRAM_BOT_TOKEN:'test-token'});const id=randomUUID();await persistLead(lead,id);
 globalThis.fetch=async(_url,init)=>{notifications.push(JSON.parse(String(init?.body)));return Response.json({ok:true,result:{}})};
 const payload=new URL(issueTelegramLink(id,secret)).searchParams.get('start');
 const req=(key:string)=>new Request('https://site.example/api/telegram/webhook',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':key},body:JSON.stringify({update_id:1,message:{chat:{id:100,type:'private'},from:{id:100,username:'test_person'},text:'/start '+payload}})});
 assert.equal((await webhook(req('wrong'))).status,403);assert.equal(notifications.length,0);
 assert.equal((await webhook(req(secret))).status,200);assert.match(JSON.stringify(notifications),/связь с вашей заявкой подтверждена/);
 const db=new DatabaseSync(path);assert.equal(db.prepare('SELECT count(*) as count FROM telegram_starts').get()?.count,1);db.close();
 }finally{globalThis.fetch=original;restore(saved);rmSync(dir,{recursive:true,force:true})}
});
test('owner can connect only intended bot with secret; existing unrelated webhook stays intact',async()=>{
 const saved={...process.env};const original=globalThis.fetch;let set=false;let old='';
 try{Object.assign(process.env,{TELEGRAM_WEBHOOK_SECRET:secret,TELEGRAM_BOT_TOKEN:'test-token',SITE_URL:'https://landing.example'});
 globalThis.fetch=async(input,init)=>{const url=String(input);if(url.endsWith('/getWebhookInfo'))return Response.json({ok:true,result:{url:old}});if(url.endsWith('/getMe'))return Response.json({ok:true,result:{username:'Tolbuhina_bot'}});assert.ok(url.endsWith('/setWebhook'));const body=JSON.parse(String(init?.body));assert.equal(body.url,'https://landing.example/api/telegram/webhook');assert.equal(body.secret_token,secret);set=true;return Response.json({ok:true,result:true})};
 const req=(value:string)=>new Request('https://landing.example/api/telegram/connect',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://landing.example'},body:JSON.stringify({secret:value})});
 assert.equal((await connect(req('wrong'))).status,403);assert.equal(set,false);
 old='https://other.example/webhook';assert.equal((await connect(req(secret))).status,409);assert.equal(set,false);
 old='';assert.equal((await connect(req(secret))).status,200);assert.equal(set,true);
 }finally{globalThis.fetch=original;restore(saved)}
});
