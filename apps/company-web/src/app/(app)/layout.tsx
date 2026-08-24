import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { TopNav } from '@/components/layout/top-nav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col bg-background">
        <TopNav />
        <main className="company-workspace min-w-0 flex-1 p-4 sm:p-6 xl:p-7">{children}</main>
      </div>
    </AuthGate>
  );
}
