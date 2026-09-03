import {db} from './db';
export class AIDraftingLimit extends Error { constructor(){super('AI drafting allowance is exhausted or not enabled for this workspace. Email is held for operator review.');} }
export async function aiUsage(org:string){
 const sql=db();
 const rows=await sql`SELECT COALESCE((SELECT (value->>'monthly_limit')::int FROM app_settings WHERE key='ai_allowance/'||${org}),CASE WHEN EXISTS(SELECT 1 FROM app_settings WHERE key='legacy_organization' AND value=to_jsonb(${org}::text)) THEN 100 ELSE 0 END) AS monthly_limit, COALESCE((SELECT value FROM app_settings WHERE key='ai_usage/'||${org}||'/'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM')),'{}'::jsonb) AS usage`;
 return {requests:0,input_tokens:0,output_tokens:0,failed:0,...rows[0].usage,monthly_limit:rows[0].monthly_limit};
}
export async function reserveDraft(org:string){
 const sql=db();const {monthly_limit:limit}=await aiUsage(org);if(limit<=0)throw new AIDraftingLimit();
 const rows=await sql`INSERT INTO app_settings(key,value) VALUES('ai_usage/'||${org}||'/'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),'{"requests":1,"input_tokens":0,"output_tokens":0,"failed":0}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=jsonb_set(app_settings.value,'{requests}',to_jsonb((app_settings.value->>'requests')::int+1)),updated_at=now() WHERE (app_settings.value->>'requests')::int<${limit} RETURNING key`;
 if(!rows[0])throw new AIDraftingLimit();return rows[0].key as string;
}
export async function recordDraft(key:string,input:number,output:number,failed=false){
 const sql=db();await sql`UPDATE app_settings SET value=value||jsonb_build_object('input_tokens',COALESCE((value->>'input_tokens')::bigint,0)+${input}::bigint,'output_tokens',COALESCE((value->>'output_tokens')::bigint,0)+${output}::bigint,'failed',COALESCE((value->>'failed')::int,0)+${failed?1:0}::int),updated_at=now() WHERE key=${key}`;
}
