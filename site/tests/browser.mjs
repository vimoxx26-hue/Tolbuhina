import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
(async()=>{
 let child,browser;const rows=[];const mode=process.env.E2E_STORAGE||'sqlite';const temp=fs.mkdtempSync(join(tmpdir(),'vitamin-e2e-'));const dbPath=join(temp,'leads.sqlite');
 const db=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{if(req.url!='/rest/v1/leads'){res.writeHead(404);return res.end()}rows.push(JSON.parse(body));res.writeHead(201);res.end()})});
 await new Promise(r=>db.listen(4010,'127.0.0.1',r));
 try{
 child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--port','3100','--hostname','127.0.0.1'],{env:{...process.env,NEXT_DIST_DIR:'.next-e2e',LEAD_STORAGE:mode,LEAD_DB_PATH:dbPath,REGISTRATION_SECRET:'isolated-browser-test-secret-32-characters-only',SUPABASE_URL:'http://127.0.0.1:4010',SUPABASE_SECRET_KEY:'local-test-signing-secret-not-a-credential',SITE_OWNER_NAME:'Тестовый владелец',SITE_OWNER_CONTACT:'test@example.test',TELEGRAM_BOT_TOKEN:'',TELEGRAM_CHAT_ID:'',SITE_URL:''},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const base='http://127.0.0.1:3100';let ready=false;
 for(let i=0;i<120;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}assert.ok(ready,output);
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync('../artifacts',{recursive:true});
 for(const [width,height] of [[1440,900],[1920,1080],[390,844],[320,640]]){await page.setViewportSize({width,height});await page.goto(base,{waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);await page.screenshot({path:`../artifacts/page-${width}.png`,fullPage:true});console.log('Viewport passed',width,height)}
 const protectedResult=await page.request.post(base+'/api/program',{headers:{Origin:base},data:{goals:['energy'],diet:'balanced',activity:'low',safety:'clear'}});assert.equal(protectedResult.status(),401);
 await page.setViewportSize({width:390,height:844});
 await page.locator('.quiz-card').screenshot({path:'../artifacts/demo-quiz.png'});
 async function quiz(safety){await page.locator('.goal').first().click();await page.getByRole('button',{name:'Продолжить'}).click();await page.getByText('Разнообразно, ем овощи, белок и крупы',{exact:true}).click();await page.getByRole('button',{name:'Продолжить'}).click();await page.getByText('Большую часть дня сижу',{exact:true}).click();await page.getByRole('button',{name:'Продолжить'}).click();await page.getByText(safety,{exact:true}).click();await page.getByRole('button',{name:'К результату'}).click();if(safety==='Ничего из перечисленного')await page.locator('.quiz-card').screenshot({path:'../artifacts/demo-registration.png'});await page.getByPlaceholder('Как к вам обращаться').fill('Тестовый посетитель');await page.getByPlaceholder('+7 999 123-45-67').fill('+79991234567');await page.getByPlaceholder('@username').fill('@test_person');assert.equal(await page.locator('input[name=consent]').isChecked(),false);await page.locator('input[name=consent]').check();await page.getByRole('button',{name:'Получить полную программу'}).click();await page.locator('.result').waitFor();}
 await quiz('Ничего из перечисленного');assert.match(await page.locator('.result').innerText(),/Ваш план заботы/);assert.ok(await page.locator('.product').count()>0);if(mode==='sqlite'){const actual=new DatabaseSync(dbPath);const stored=actual.prepare('select * from leads').all();assert.equal(stored.length,1);assert.equal(stored[0].name,'Тестовый посетитель');assert.equal(stored[0].telegram,'@test_person');assert.deepEqual(Object.keys(stored[0]).sort(),['consent','consent_version','created_at','id','name','page','phone','telegram','utm']);actual.close();assert.equal(fs.statSync(dbPath).mode&0o777,0o600)}else{assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['consent','consent_version','name','page','phone','telegram','utm'])}assert.equal(await page.evaluate(()=>document.cookie.includes('wellness_access')),false);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('.quiz-section').screenshot({path:'../artifacts/result-mobile.png'});await page.locator('.quiz-card').screenshot({path:'../artifacts/demo-result.png'});
 await page.getByRole('button',{name:'Пройти заново'}).click();await quiz('Принимаю лекарства');assert.equal(await page.locator('.product').count(),0);assert.match(await page.locator('.result').innerText(),/Сначала проверьте/);assert.deepEqual(errors,[]);console.log(`PASS: full browser registration → ${mode==='sqlite'?'actual temporary SQLite':'REST database mock'} → HttpOnly access → program; restricted branch has no products. No health answers persisted. No JS errors.`);
 }finally{await browser?.close();child?.kill('SIGTERM');db.close();fs.rmSync(temp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
