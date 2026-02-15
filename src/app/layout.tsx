import './globals.css';
import Link from 'next/link';
import type { Metadata, Route } from 'next';

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
        <header className="container" style={{ paddingBottom: 0 }}>
          <div
            className="card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <strong>AI Video Enrichment Platform</strong>
            <nav style={{ display: 'flex', gap: 12 }}>
              <Link href="/dashboard/jobs">Jobs</Link>
              <Link href={'/dashboard/coverage' as Route}>Coverage</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
