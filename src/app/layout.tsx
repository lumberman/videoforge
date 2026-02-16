import './globals.css';
import type { Metadata } from 'next';
import { GlobalShell } from './global-shell';

export const metadata: Metadata = {
  title: 'AI Video Enrichment Platform',
  description: 'Workflow-driven video enrichment dashboard'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <GlobalShell>{children}</GlobalShell>
      </body>
    </html>
  );
}
