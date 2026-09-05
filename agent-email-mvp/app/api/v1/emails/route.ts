import {sendApi} from '../../../../lib/api-send';
import {errorResponse} from '../../../../lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{return await sendApi(req);}catch(e){return errorResponse(e);}}
