export function ownershipRecord(name:string,token:string){return {name:'_agentmail-verification.'+name,type:'TXT',value:'agentmail-verification='+token};}
export async function ownsDomain(name:string,token:string){
 const record=ownershipRecord(name,token);const url=new URL('https://cloudflare-dns.com/dns-query');url.searchParams.set('name',record.name);url.searchParams.set('type','TXT');
 const r=await fetch(url,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('DNS lookup unavailable');const b=await r.json() as {Status:number;Answer?:{type:number;data:string}[]};if(b.Status!==0&&b.Status!==3)throw Error('DNS lookup unavailable');
 return !!b.Answer?.some(a=>a.type===16&&a.data.replace(/"\s*"/g,'').replace(/^"|"$/g,'')===record.value);
}
