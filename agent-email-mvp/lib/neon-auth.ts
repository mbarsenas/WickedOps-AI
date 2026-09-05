import {createNeonAuth} from '@neondatabase/auth/next/server';
export function emailAuth(){
 if(!process.env.NEON_AUTH_BASE_URL||!process.env.NEON_AUTH_COOKIE_SECRET)throw new Error('Email sign-in is not configured');
 return createNeonAuth({baseUrl:process.env.NEON_AUTH_BASE_URL,cookies:{secret:process.env.NEON_AUTH_COOKIE_SECRET,sessionDataTtl:60}});
}
