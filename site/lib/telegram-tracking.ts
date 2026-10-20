import {DatabaseSync} from 'node:sqlite';
import {storageMode} from './storage';
export type TelegramIdentity={id:number;chatId:number;username?:string};
export async function markTelegramStarted(id:string,user:TelegramIdentity):Promise<boolean>{
 if(!Number.isSafeInteger(user.id)||user.id<=0||!Number.isSafeInteger(user.chatId)||user.chatId!==user.id||!user.username)return false;
 if(storageMode()==='sqlite'){
  if(!process.env.LEAD_DB_PATH)throw Error('Storage unavailable');
  const db=new DatabaseSync(process.env.LEAD_DB_PATH);
  try{
   const lead=db.prepare('SELECT telegram FROM leads WHERE id=?').get(id);
   if(!lead||String(lead.telegram).toLowerCase()!=='@'+user.username.toLowerCase())return false;
   db.exec('CREATE TABLE IF NOT EXISTS telegram_starts (lead_id TEXT PRIMARY KEY REFERENCES leads(id), telegram_user_id TEXT NOT NULL, telegram_chat_id TEXT NOT NULL, telegram_started_at TEXT NOT NULL)');
   db.prepare('INSERT OR IGNORE INTO telegram_starts VALUES (?,?,?,?)').run(id,String(user.id),String(user.chatId),new Date().toISOString());
   return db.prepare('SELECT telegram_user_id FROM telegram_starts WHERE lead_id=?').get(id)?.telegram_user_id===String(user.id);
  }finally{db.close()}
 }
 if(storageMode()!=='supabase'||!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw Error('Storage unavailable');
 const url=new URL('/rest/v1/leads',process.env.SUPABASE_URL);if(url.protocol!=='https:')throw Error('HTTPS required');
 const headers={apikey:process.env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${process.env.SUPABASE_SECRET_KEY}`};
 url.searchParams.set('id','eq.'+id);url.searchParams.set('select','id,telegram,telegram_user_id');
 const r=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Tracking schema or storage unavailable');
 const [lead]=await r.json();if(!lead||String(lead.telegram).toLowerCase()!=='@'+user.username.toLowerCase())return false;
 if(lead.telegram_user_id!==null)return String(lead.telegram_user_id)===String(user.id);
 url.searchParams.set('telegram_user_id','is.null');url.searchParams.set('select','id');
 const saved=await fetch(url,{method:'PATCH',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({telegram_user_id:user.id,telegram_chat_id:user.chatId,telegram_started_at:new Date().toISOString()}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!saved.ok)throw Error('Tracking write unavailable');
 if((await saved.json()).length)return true;
 // A concurrent delivery may have completed the same binding; never overwrite another user.
 url.searchParams.delete('telegram_user_id');url.searchParams.set('select','telegram_user_id');
 const repeat=await fetch(url,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});if(!repeat.ok)throw Error('Tracking read unavailable');
 return String((await repeat.json())[0]?.telegram_user_id)===String(user.id);
}
