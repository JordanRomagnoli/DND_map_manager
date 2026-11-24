import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Map Manager D&D',
  description: 'La mappa di battaglia per Dungeons & Dragons: il Master prepara la scena, i giocatori muovono le pedine dal telefono, in tempo reale.',
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
