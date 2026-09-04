// The local-only Vite config replaces this module. Hosted builds cannot run lab operations.
export async function runLocalLab(_request:Request,_workspace:string):Promise<Response>{return Response.json({error:'Not found'},{status:404});}
