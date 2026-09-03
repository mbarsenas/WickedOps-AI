import fs from 'node:fs';
for(const line of fs.readFileSync('.dev.vars','utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i<1)continue;const key=line.slice(0,i);let value=line.slice(i+1);try{value=JSON.parse(value);}catch{}if(key!=='DATABASE_URL'||!process.env.DATABASE_URL)process.env[key]=value;}
const {db}=await import('../lib/db.ts');const {refreshDomain}=await import('../lib/domains.ts');const sql=db();const legacy=(await sql`SELECT value FROM app_settings WHERE key='legacy_organization'`)[0].value;
const domains=await sql`SELECT id,name FROM sending_domains WHERE organization_id=${legacy}`;
for(const d of domains){const refreshed=await refreshDomain(d.id,legacy);console.log(d.name+': '+refreshed.status+', receiving '+refreshed.receiving);}
