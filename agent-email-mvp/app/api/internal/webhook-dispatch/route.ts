import {schedulerAuthorized,runWebhookSchedule} from '../../../../lib/scheduler';
import {errorResponse} from '../../../../lib/auth';
export async function POST(req:Request){
 if(!await schedulerAuthorized(req.headers.get('authorization')))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await runWebhookSchedule());}catch(e){return errorResponse(e);}
}
