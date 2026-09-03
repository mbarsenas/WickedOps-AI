import {db} from './db';
import {mail} from './email';
import {HttpError} from './auth';
export async function refreshDomain(id:string,org:string,verify=false){
 const sql=db();let row=(await sql`SELECT * FROM sending_domains WHERE id=${id} AND organization_id=${org}`)[0];
 if(!row)throw new HttpError(404,'Domain not found.');
 if(!row.provider_id){
  const legacy=await sql`SELECT key FROM app_settings WHERE key='legacy_organization' AND value=to_jsonb(${org}::text)`;
  if(!legacy[0])throw new HttpError(409,'Domain setup is incomplete. Contact the workspace operator.');
  const domains=await mail().domains.list();const match=domains.data?.data.find(d=>d.name===row.name);
  if(!match)throw new HttpError(409,'Domain is not provisioned.');
  row=(await sql`UPDATE sending_domains SET provider_id=${match.id} WHERE id=${id} RETURNING *`)[0];
 }
 if(verify){const r=await mail().domains.verify(row.provider_id);if(r.error)throw new HttpError(502,'Unable to start domain verification.');}
 const result=await mail().domains.get(row.provider_id);if(result.error||!result.data)throw new HttpError(502,'Unable to refresh domain status.');
 const d=result.data;return (await sql`UPDATE sending_domains SET status=${d.status},receiving=${d.capabilities?.receiving||'disabled'},records=${JSON.stringify(d.records)}::jsonb WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
}
