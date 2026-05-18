import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import { PaperTexture } from './components/PaperTexture';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
});

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'The Policy Place — Certificate Portal',
  description: 'Self-serve Certificate of Insurance portal for The Policy Place clients.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Policy Place',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="relative min-h-screen bg-paper font-sans text-ink antialiased selection:bg-brand/15 selection:text-ink">
        <PaperTexture />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
