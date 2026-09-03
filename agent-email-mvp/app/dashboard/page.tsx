import {getUser} from '../../lib/auth';
import {redirect} from 'next/navigation';
import { organizationId } from '../../lib/db';
import Onboarding from './onboarding';
import Dashboard from './workspace';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{view?:string}>}){
 const query=await searchParams;
 const user=await getUser();
 if(!user)redirect(query.view==='billing'?'/sign-in?return_to=%2Fdashboard%3Fview%3Dbilling':'/sign-in');
 try{await organizationId(user.email);}catch{return <Onboarding email={user.email}/>;}
 return <Dashboard email={user.email}/>;
}


