import { db } from './db';
export type Decision='allow'|'require_approval'|'block';
export type Rule={id:string;name:string;effect:Decision;condition_json:Record<string,unknown>;priority:number};
export function decide(policies: Rule[], payload: Record<string,unknown>) {
 for(const p of [...policies].sort((a,b)=>a.priority-b.priority || a.id.localeCompare(b.id))){
  if(Object.entries(p.condition_json??{}).every(([k,v])=>Object.hasOwn(payload,k)&&payload[k]===v))
   return {decision:p.effect,policyId:p.id,reason:'Matched policy: '+p.name};
 }
 return {decision:'require_approval' as Decision,policyId:null,reason:'No matching policy; human approval is required.'};
}
export async function evaluatePolicy(agentId:string,actionType:string,payload:Record<string,unknown>){
 const sql=db();
 const rows=await sql`SELECT id,name,effect,condition_json,priority FROM policies WHERE agent_id=${agentId} AND action_type=${actionType} AND enabled=true ORDER BY priority,id`;
 return decide(rows as Rule[],payload);
}

