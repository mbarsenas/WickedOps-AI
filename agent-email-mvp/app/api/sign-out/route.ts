import {cookies} from 'next/headers';
import {requireUser,errorResponse} from '../../../lib/auth';
import {emailAuth} from '../../../lib/neon-auth';
export async function POST(req:Request){try{await requireUser(req);if(process.env.NEON_AUTH_BASE_URL)await emailAuth().signOut();(await cookies()).delete('agentmail_workspace');return Response.json({redirect:'/signout-with-chatgpt?return_to=/sign-in'});}catch(e){return errorResponse(e);}}
