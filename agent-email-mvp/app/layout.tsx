import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Governed Agent Email', description: 'Give AI agents an email address—and control what happens next.', metadataBase: new URL('https://governed-agent-email.markbarsenas366.chatgpt.site'), openGraph: { images: ['/og.png'], title: 'Governed Agent Email', description: 'An inbox for your agents. Authority for you.' }, twitter: { images: ['/og.png'], card: 'summary_large_image', title: 'Governed Agent Email', description: 'An inbox for your agents. Authority for you.' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

