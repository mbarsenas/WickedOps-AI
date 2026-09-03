import {getUser} from '../../lib/auth';
import {redirect} from 'next/navigation';
import { organizationId } from '../../lib/db';
import Onboarding from './onboarding';
import Dashboard from './workspace';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getUser();
 if(!user)redirect('/sign-in');
 try{await organizationId(user.email);}catch{return <Onboarding email={user.email}/>;}
 return <Dashboard email={user.email}/>;
}


