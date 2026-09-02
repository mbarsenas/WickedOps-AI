import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sable — Your personal AI assistant",
  description:
    "Create a voice-controlled AI assistant shaped around your personality, preferences, computer, and connected services.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
