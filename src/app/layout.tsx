import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenRive',
  description: 'A local, login-free editor for Rive (.riv) files: design, animate and build state machines.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
