import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
export async function getChatGPTUser(){const token=(await cookies()).get('senderpermit_lab')?.value;return token&&token===process.env.LAB_SESSION?{email:'owner@senderpermit.test',displayName:'Local lab owner',fullName:'Local lab owner'}:null;}
export function chatGPTSignInPath(_returnTo:string){return '/signin-with-chatgpt';}
export function chatGPTSignOutPath(_returnTo='/'){return '/signout-with-chatgpt';}
export async function requireChatGPTUser(_returnTo:string){const user=await getChatGPTUser();if(!user)redirect('/signin-with-chatgpt');return user;}
