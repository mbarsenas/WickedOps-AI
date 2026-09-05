export function publicWebhookUrl(value:string){
 const u=new URL(value);const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!host.includes('.')||host.includes(':')||/^[\d.]+$/.test(host)||/(^|\.)(localhost|local|internal|test|invalid)$/.test(host))throw new Error('Use a public HTTPS endpoint with no credentials or custom port.');
 return u.toString();
}
export async function signEvent(secret:string,id:string,timestamp:string,body:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(id+'.'+timestamp+'.'+body)))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
