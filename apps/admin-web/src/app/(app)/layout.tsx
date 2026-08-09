import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { TopNav } from '@/components/layout/top-nav';
import { LiveActivityWidget } from '@/components/layout/live-activity-widget';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <main className="flex-1 bg-muted/30 p-6">{children}</main>
        <LiveActivityWidget />
      </div>
    </AuthGate>
  );
}
