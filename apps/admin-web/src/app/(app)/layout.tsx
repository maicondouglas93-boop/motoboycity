import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { TopNav } from '@/components/layout/top-nav';
import { LiveActivityWidget } from '@/components/layout/live-activity-widget';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col bg-background">
        <TopNav />
        <main className="admin-workspace flex-1 px-4 py-5 sm:px-6 sm:py-7 xl:px-8 xl:py-8">
          {children}
        </main>
        <LiveActivityWidget />
      </div>
    </AuthGate>
  );
}
