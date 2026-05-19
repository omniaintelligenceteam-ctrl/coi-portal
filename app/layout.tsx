import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
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
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="relative min-h-screen bg-paper font-sans text-ink antialiased selection:bg-brand/15 selection:text-ink">
        <PaperTexture />
        <div className="relative z-10">{children}</div>
        {/* Editorial-themed Sonner toaster. Paper-warm surface, hairline ink
            border, Geist sans (inherited), 6px radius to match cards. No
            shimmer, no candy colors — see toastOptions.style below. */}
        <style>{`
          [data-sonner-toaster][data-theme] {
            --normal-bg: var(--color-paper);
            --normal-border: var(--color-hairline-strong);
            --normal-text: var(--color-ink);
            --success-bg: var(--color-paper);
            --success-border: var(--color-success);
            --success-text: var(--color-ink);
            --error-bg: var(--color-paper);
            --error-border: var(--color-danger);
            --error-text: var(--color-ink);
            --warning-bg: var(--color-paper);
            --warning-border: var(--color-warning);
            --warning-text: var(--color-ink);
            --info-bg: var(--color-paper);
            --info-border: var(--color-brand);
            --info-text: var(--color-ink);
          }
          [data-sonner-toast] {
            font-family: var(--font-sans) !important;
            border-radius: 6px !important;
            border-width: 1px !important;
            box-shadow: var(--shadow-lift) !important;
          }
        `}</style>
        <Toaster
          position="bottom-right"
          theme="light"
          richColors={false}
          closeButton
          gap={10}
          offset={24}
          toastOptions={{
            duration: 4500,
            classNames: {
              toast: 'editorial-toast',
              title: 'editorial-toast-title',
              description: 'editorial-toast-description',
            },
          }}
        />
      </body>
    </html>
  );
}
