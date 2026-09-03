import {getUser} from '../../lib/auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Start(){const user=await getUser();redirect(user?'/dashboard?view=billing':'/sign-in?return_to=%2Fdashboard%3Fview%3Dbilling');}
