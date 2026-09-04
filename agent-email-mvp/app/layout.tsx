import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'SenderPermit — Email infrastructure for software and agents', description: 'Email infrastructure powered by AI. Send and receive email, draft replies with AI, and control delivery with policies and approvals.', icons: { icon: [{url:'/favicon.svg',type:'image/svg+xml'}] }, metadataBase: new URL('https://senderpermit.com'), openGraph: { images: ['/og.png'], title: 'SenderPermit', description: 'Email infrastructure for software and agents.' }, twitter: { images: ['/og.png'], card: 'summary_large_image', title: 'SenderPermit', description: 'Email infrastructure for software and agents.' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

