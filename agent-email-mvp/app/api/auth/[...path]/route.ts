import {emailAuth} from '../../../../lib/neon-auth';
export const dynamic='force-dynamic';
export async function GET(req:Request,ctx:any){return emailAuth().handler().GET(req,ctx);}
export async function POST(req:Request,ctx:any){return emailAuth().handler().POST(req,ctx);}
