import { getChatGPTUser,chatGPTSignInPath } from '../chatgpt-auth';
import { organizationId } from '../../lib/db';
import Onboarding from './onboarding';
import Dashboard from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getChatGPTUser();
 if(!user)return <main className="auth-card"><a className="brand" href="/">AgentMail</a><h1 style={{marginTop:32}}>Email infrastructure.<br/>Built for developers.</h1><p className="muted">Sign in to manage API keys, domains, email logs, webhooks, and governed agents.</p><a className="button" href={chatGPTSignInPath('/dashboard')} target="_top">Sign in with ChatGPT ↗</a><p className="caption" style={{marginTop:20}}>Create a private workspace for your email infrastructure.</p></main>;
 try{await organizationId(user.email);}catch{return <Onboarding email={user.email}/>;}
 return <Dashboard email={user.email}/>;
}


