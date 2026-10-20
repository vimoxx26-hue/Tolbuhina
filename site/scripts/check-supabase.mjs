import {loadEnvFile} from 'node:process';
try{loadEnvFile('.env.local')}catch{/* Hosting can inject configuration. */}
async function main(){
 if(process.env.LEAD_STORAGE!=='supabase')throw Error('Set LEAD_STORAGE=supabase in the target environment');
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)throw Error('Add SUPABASE_URL and the server-only SUPABASE_SECRET_KEY privately');
 if(!process.env.REGISTRATION_SECRET||process.env.REGISTRATION_SECRET.length<32)throw Error('Set a separate random REGISTRATION_SECRET of at least 32 characters');
 if(!process.env.SITE_OWNER_NAME||!process.env.SITE_OWNER_CONTACT)throw Error('Set SITE_OWNER_NAME and SITE_OWNER_CONTACT');
 const url=new URL('/rest/v1/leads',process.env.SUPABASE_URL);
 if(url.protocol!=='https:')throw Error('SUPABASE_URL must use HTTPS');
 url.searchParams.set('select','id,created_at,name,phone,telegram,consent,consent_version,page,utm');url.searchParams.set('limit','0');
 let response;try{response=await fetch(url,{headers:{apikey:process.env.SUPABASE_SECRET_KEY,Authorization:`Bearer ${process.env.SUPABASE_SECRET_KEY}`},signal:AbortSignal.timeout(15000)})}catch{throw Error('Cannot reach Supabase. Check project URL and network access')}
 if(!response.ok)throw Error(`Supabase check failed (HTTP ${response.status}). Check the server key and execute supabase/leads.sql`);
 console.log('Supabase API and required table columns verified. No rows read or written. Production registration still needs a real end-to-end check.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
