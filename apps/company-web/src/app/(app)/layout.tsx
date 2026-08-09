import type { ReactNode } from 'react';
import { TopNav } from '@/components/layout/top-nav';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="flex-1 bg-muted/30 p-6">{children}</main>
    </div>
  );
}
