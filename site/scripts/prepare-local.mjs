import {existsSync,readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const path=resolve('.env.local');
let text=existsSync(path)?readFileSync(path,'utf8'):'';
const dir=resolve('../.data');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
const defaults={LEAD_STORAGE:'sqlite',LEAD_DB_PATH:resolve(dir,'leads.sqlite'),REGISTRATION_SECRET:randomBytes(48).toString('hex'),SITE_OWNER_NAME:'Виталий',SITE_OWNER_CONTACT:'https://t.me/Vimoxx26'};
for(const [key,value] of Object.entries(defaults))if(!new RegExp(`^${key}=.+$`,'m').test(text)){text=text.replace(new RegExp(`^${key}=.*\\n?`,'m'),'');text+=(text.endsWith('\n')||!text?'':'\n')+`${key}=${value}\n`}
writeFileSync(path,text,{mode:0o600});chmodSync(path,0o600);console.log('Local SQLite configuration prepared; existing settings preserved. Secret values are not displayed.');
