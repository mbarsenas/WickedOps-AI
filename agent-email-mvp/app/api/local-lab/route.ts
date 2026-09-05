import {requireWorkspace,errorResponse} from '../../../lib/auth';
import {runLocalLab} from '../../../lib/local-lab';
export async function POST(request:Request){try{const user=await requireWorkspace(request);return await runLocalLab(request,user.organization_id);}catch(e){return errorResponse(e);}}
