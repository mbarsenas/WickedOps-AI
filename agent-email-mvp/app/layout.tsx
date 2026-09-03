import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AgentMail — Email infrastructure for software and agents', description: 'Send, receive, and govern transactional email through one developer API.', metadataBase: new URL('https://governed-agent-email.markbarsenas366.chatgpt.site'), openGraph: { images: ['/og.png'], title: 'AgentMail', description: 'Email infrastructure for software and agents.' }, twitter: { images: ['/og.png'], card: 'summary_large_image', title: 'AgentMail', description: 'Email infrastructure for software and agents.' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }

