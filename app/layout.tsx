import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'D&D Map Manager - Real-Time Battlespace',
  description: 'Gestisci stanze, griglie tattiche, mappe personalizzate e token per Dungeons & Dragons in tempo reale con WebSockets.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
