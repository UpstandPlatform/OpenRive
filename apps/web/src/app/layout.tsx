import type { Metadata } from 'next';
import { AuthGate } from '@/components/AuthGate';
import { DesktopChrome } from '@/components/DesktopChrome';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenRive',
  description: 'An open-source editor for Rive (.riv) files: design, animate and build state machines.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">
        <DesktopChrome />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
