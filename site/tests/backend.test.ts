import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { registrationSecret } from '../lib/storage';
import { NextRequest } from 'next/server';
import { issueAccess, verifyAccess } from '../lib/access';
import { buildProgram } from '../lib/program';
import { validateLead, validateQuiz } from '../lib/validation';
import { POST as register } from '../app/api/lead/route';
import { POST as program } from '../app/api/program/route';

const validLead = { name: 'Тестовый посетитель', phone: '+7 (999) 123-45-67', telegram: '@test_person', consent: true, website: '' };
const quiz = { goals: ['sleep'], diet: 'balanced', activity: 'moderate', safety: 'clear' };
const request = (path: string, body: unknown, extra: Record<string, string> = {}) => new NextRequest(`https://landing.example${path}`, { method: 'POST', headers: { origin: 'https://landing.example', 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

test('access is signed, time limited, and rejects tampering', () => {
 const token = issueAccess('secret', 1000);
 assert.equal(verifyAccess(token, 'secret', 1000), true);
 assert.equal(verifyAccess(token, 'wrong', 1000), false);
 assert.equal(verifyAccess(token + 'x', 'secret', 1000), false);
 assert.equal(verifyAccess(token, 'secret', 1000 + 86400001), false);
});
test('registration validates all contacts and explicit consent', () => {
 assert.equal(validateLead(validLead)?.phone, '+79991234567');
 for (const change of [{consent:false}, {phone:'123'}, {telegram:'bad'}, {website:'bot'}, {name:''}]) assert.equal(validateLead({...validLead, ...change}), null);
});
test('health restrictions return no products; goals and diet affect plan', () => {
 const base = validateQuiz(quiz)!;
 assert.ok(base);
 for (const safety of ['pregnant','medications','minor','condition']) assert.deepEqual(buildProgram({...base,safety}).products, []);
 const result = buildProgram(base);
 assert.equal(result.products[0].name, 'Магний Хелат');
 assert.match(result.products[0].description, /Противопоказания/);
 assert.equal(buildProgram({...base,goals:['immunity']}).products.length,0);
 assert.equal(buildProgram({...base,goals:['balance'],diet:'plant'}).products.length,0);
 assert.equal(validateQuiz({...quiz,goals:['unknown']}),null);
});
test('registration gates program, persists before issuing access, and refuses failed persistence', async () => {
 const saved = { ...process.env }; const originalFetch = globalThis.fetch;
 try {
   process.env.LEAD_STORAGE = 'supabase';
   delete process.env.REGISTRATION_SECRET;
   delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;
   assert.equal((await register(request('/api/lead', validLead))).status,503);
   assert.equal((await program(request('/api/program',quiz))).status,401);
   Object.assign(process.env, { SUPABASE_URL:'https://database.example', SUPABASE_SECRET_KEY:'test-secret', SITE_OWNER_NAME:'Test owner', SITE_OWNER_CONTACT:'test@example.com' });
   delete process.env.TELEGRAM_BOT_TOKEN;
   let persisted: Record<string,unknown> | undefined;
   globalThis.fetch = async (_input, init) => { persisted = JSON.parse(String(init?.body)); return new Response(null,{status:201}); };
   const response=await register(request('/api/lead', {...validLead, quiz, safety:'condition'}));
   assert.equal(response.status,200);
   assert.ok(persisted); assert.equal(persisted.safety,undefined); assert.equal(persisted.quiz,undefined);
   const cookie=response.headers.get('set-cookie')!;
   assert.match(cookie,/HttpOnly/i); assert.match(cookie,/SameSite=strict/i); assert.match(cookie,/Secure/i);
   const result=await program(request('/api/program',quiz,{cookie:cookie.split(';')[0]}));
   assert.equal(result.status,200); assert.match(result.headers.get('cache-control')!,/no-store/);
   globalThis.fetch=async()=>new Response(null,{status:500});
   const failed=await register(request('/api/lead',validLead));
   assert.equal(failed.status,503); assert.equal(failed.headers.get('set-cookie'),null);
   const crossOrigin=await register(request('/api/lead',validLead,{origin:'https://attacker.example'}));
   assert.equal(crossOrigin.status,403);
 } finally {
   globalThis.fetch=originalFetch;
   for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
   Object.assign(process.env,saved);
 }
});

test('SQLite durably stores only contacts with private permissions before unlocking the program', async () => {
 const saved = { ...process.env }; const originalFetch = globalThis.fetch;
 const directory = mkdtempSync(join(tmpdir(), 'wellness-sqlite-test-'));
 const dbPath = join(directory, 'private', 'leads.sqlite');
 try {
   Object.assign(process.env, { LEAD_STORAGE:'sqlite', LEAD_DB_PATH:dbPath, REGISTRATION_SECRET:'local-test-registration-signing-secret-32-plus', SITE_OWNER_NAME:'Test owner', SITE_OWNER_CONTACT:'test@example.com' });
   delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; delete process.env.TELEGRAM_BOT_TOKEN;
   globalThis.fetch=async()=>{throw new Error('SQLite registration must not need a network database')};
   const response=await register(request('/api/lead',{...validLead,goals:['energy'],safety:'condition'},{'x-forwarded-for':'192.0.2.21'}));
   assert.equal(response.status,200);
   assert.equal(statSync(dbPath).mode & 0o777,0o600);
   assert.equal(statSync(join(directory,'private')).mode & 0o777,0o700);
   // Open a separate connection after registration to prove the write survived close.
   const db=new DatabaseSync(dbPath,{readOnly:true});
   const rows=db.prepare('SELECT * FROM leads').all();
   const columns=db.prepare('PRAGMA table_info(leads)').all().map(x=>x.name);
   db.close();
   assert.equal(rows.length,1);
   assert.equal(rows[0].name,validLead.name);
   assert.equal(rows[0].phone,'+79991234567');
   assert.equal(rows[0].telegram,'@test_person');
   assert.equal(rows[0].consent,1);
   assert.deepEqual(columns,['id','created_at','name','phone','telegram','consent','consent_version','page','utm']);
   assert.equal(rows[0].safety,undefined); assert.equal(rows[0].goals,undefined);
   const cookie=response.headers.get('set-cookie')!;
   assert.match(cookie,/HttpOnly/i);
   assert.equal((await program(request('/api/program',quiz,{cookie:cookie.split(';')[0],'x-forwarded-for':'192.0.2.21'}))).status,200);
   process.env.REGISTRATION_SECRET='too-short';
   process.env.SUPABASE_SECRET_KEY='even-a-supabase-key-must-not-be-used-for-sqlite';
   assert.equal(registrationSecret(),null);
   const unconfigured=await register(request('/api/lead',validLead,{'x-forwarded-for':'192.0.2.22'}));
   assert.equal(unconfigured.status,503); assert.equal(unconfigured.headers.get('set-cookie'),null);
   process.env.REGISTRATION_SECRET='local-test-registration-signing-secret-32-plus';
   const impossible=join(directory,'directory-not-a-database');mkdirSync(impossible);
   process.env.LEAD_DB_PATH=impossible;
   const failed=await register(request('/api/lead',validLead,{'x-forwarded-for':'192.0.2.23'}));
   assert.equal(failed.status,503); assert.equal(failed.headers.get('set-cookie'),null);
 } finally {
   globalThis.fetch=originalFetch;
   for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
   Object.assign(process.env,saved);
   rmSync(directory,{recursive:true,force:true});
 }
});


test('registration configuration logs identify missing settings without secrets or submitted contacts', async () => {
 const saved={...process.env};const original=console.error;const logs:unknown[][]=[];
 console.error=(...args:unknown[])=>{logs.push(args)};
 try {
  Object.assign(process.env,{LEAD_STORAGE:'supabase',SUPABASE_URL:'https://database.example',SUPABASE_SECRET_KEY:'private-test-secret-value',SITE_OWNER_NAME:'Test owner'});
  delete process.env.REGISTRATION_SECRET;delete process.env.SITE_OWNER_CONTACT;
  const response=await register(request('/api/lead',validLead,{'x-forwarded-for':'192.0.2.44'}));
  assert.equal(response.status,503);
  const log=JSON.stringify(logs);assert.match(log,/SITE_OWNER_CONTACT missing/);
  for(const value of ['private-test-secret-value',validLead.name,validLead.phone,validLead.telegram])assert.equal(log.includes(value),false);
 } finally {
  console.error=original;
  for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];
  Object.assign(process.env,saved);
 }
});
