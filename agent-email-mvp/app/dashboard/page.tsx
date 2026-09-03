import { getChatGPTUser,chatGPTSignInPath } from '../chatgpt-auth';
import { isAdmin } from '../../lib/auth';
import Dashboard from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getChatGPTUser();
 if(!user)return <main className="auth-card"><a className="brand" href="/">↗ Governed / Email</a><h1 style={{marginTop:32}}>Your agents.<br/>Your authority.</h1><p className="muted">Sign in to review conversations, manage policies, and approve replies.</p><a className="button" href={chatGPTSignInPath('/dashboard')} target="_top">Sign in with ChatGPT ↗</a><p className="caption" style={{marginTop:20}}>This MVP workspace is restricted to its administrators.</p></main>;
 if(!isAdmin(user.email))return <main className="auth-card"><h1>Workspace access required</h1><p>You are signed in as {user.email}. This workspace is restricted to its administrators.</p><a className="button secondary" href="/signout-with-chatgpt?return_to=/">Switch account</a></main>;
 return <Dashboard email={user.email}/>;
}

