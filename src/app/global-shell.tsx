'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';

export function shouldHideGlobalHeader(pathname: string | null): boolean {
  return pathname === '/dashboard/coverage';
}

export function GlobalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideGlobalHeader = shouldHideGlobalHeader(pathname);

  return (
    <>
      {!hideGlobalHeader && (
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
      )}
      {children}
    </>
  );
}
