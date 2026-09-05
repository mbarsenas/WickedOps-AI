import { getChatGPTUser } from '../app/chatgpt-auth';
import { organizationId } from './db';
import {emailAuth} from './neon-auth';
export class HttpError extends Error { constructor(public status: number, message: string){super(message);} }
export function isAdmin(email: string) {return (process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(email.toLowerCase());}
export async function getUser(){
 if(process.env.NEON_AUTH_BASE_URL){const {data}=await emailAuth().getSession();if(data?.user&&data.user.emailVerified)return {email:data.user.email.toLowerCase(),displayName:data.user.name,fullName:data.user.name};}
 return getChatGPTUser();
}
export async function requireUser(request?: Request) {
 const user=await getUser();
 if(!user) throw new HttpError(401,'Sign in to continue.');
 if(request && !['GET','HEAD'].includes(request.method)) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'JSON is required.');
  const origin=request.headers.get('origin');
  const expected=process.env.APP_BASE_URL;
  const allowed=[expected||new URL(request.url).origin,...(process.env.ADDITIONAL_APP_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean)];
  if(!origin || !allowed.includes(origin)) throw new HttpError(403,'Request origin is not allowed.');
 }
 return user;
}
export async function requireWorkspace(request?:Request){
 const user=await requireUser(request);
 let organization_id:string;
 try{organization_id=await organizationId(user.email);}catch{throw new HttpError(403,'Create your workspace to continue.');}
 return {...user,organization_id};
}
export function errorResponse(error: unknown) {
 if(error instanceof HttpError) return Response.json({error:error.message},{status:error.status});
 if(error && typeof error==='object' && 'issues' in error) return Response.json({error:'Please check the form fields.'},{status:400});
 console.error('Request failed', error instanceof Error ? error.message : 'unknown');
 return Response.json({error:'The request could not be completed. Check service configuration or retry.'},{status:500});
}

