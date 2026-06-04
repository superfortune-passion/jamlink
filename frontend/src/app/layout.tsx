import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JamLink — Connect with Musicians Instantly',
  description:
    'Anonymous audio matchmaking for musicians. Jam, collaborate, and connect in real-time with minimal latency.',
  keywords: ['musicians', 'jam', 'collaboration', 'webrtc', 'audio', 'matchmaking'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0a0a0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
