import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import { RouteTransition } from './components/motion';
import { ThemeProvider, themePrePaintScript } from './components/ThemeProvider';
import { InstallPrompt } from './components/InstallPrompt';
import './globals.css';

/**
 * Root layout — Statement design system.
 *
 * Fonts: Geist + Geist Mono via next/font. Fraunces (the prior editorial
 * serif) is retired. .font-display now renders in Geist at display weight
 * and tracking, defined in globals.css.
 *
 * Theme: <ThemeProvider> exposes system/light/dark mode and persists the
 * choice to localStorage. The pre-paint script in <head> sets data-theme
 * synchronously before React mounts, eliminating any flash of wrong theme.
 *
 * PaperTexture: retired. Statement uses a clean off-white canvas — no
 * grain, no noise. The visual weight is type + hairline, not texture.
 */

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f8f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a09' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-paint theme script — must run before any styles paint to
            prevent flash of wrong theme. See ThemeProvider for the source. */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: themePrePaintScript }}
        />
      </head>
      <body className="relative min-h-screen bg-paper font-sans text-ink antialiased selection:bg-brand selection:text-white">
        <ThemeProvider>
          <RouteTransition className="relative z-10">{children}</RouteTransition>
          <InstallPrompt />
          <style>{`
            [data-sonner-toaster][data-theme] {
              --normal-bg: var(--color-card);
              --normal-border: var(--color-hairline-strong);
              --normal-text: var(--color-ink);
              --success-bg: var(--color-card);
              --success-border: var(--color-success);
              --success-text: var(--color-ink);
              --error-bg: var(--color-card);
              --error-border: var(--color-danger);
              --error-text: var(--color-ink);
              --warning-bg: var(--color-card);
              --warning-border: var(--color-warning);
              --warning-text: var(--color-ink);
              --info-bg: var(--color-card);
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
        </ThemeProvider>
      </body>
    </html>
  );
}
