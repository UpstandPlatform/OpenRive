import type { Metadata } from 'next';
import { AuthGate } from '@/components/AuthGate';
import { DialogProvider, DirectionProvider, TooltipProvider } from '@openrive/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenRive',
  description: 'An open-source editor for Rive (.riv) files: design, animate and build state machines.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" dir="ltr" className="h-full antialiased dark">
      <body className="h-full">
        <AuthGate>
          <DirectionProvider direction="ltr">
            <TooltipProvider>
              <DialogProvider>{children}</DialogProvider>
            </TooltipProvider>
          </DirectionProvider>
        </AuthGate>
      </body>
    </html>
  );
}
