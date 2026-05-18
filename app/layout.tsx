import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Policy Place — Certificate Portal',
  description:
    'Self-serve Certificate of Insurance portal for The Policy Place clients.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
