import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
import { TopNav } from '@/components/layout/top-nav';
import { LiveActivityWidget } from '@/components/layout/live-activity-widget';
import { AdminActivityFeedProvider } from '@/lib/use-admin-activity-feed';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AdminActivityFeedProvider>
        <div className="flex min-h-screen flex-col bg-background">
          <TopNav />
          {/*
            `pb-24` reserva a altura do botao flutuante de atividade.
            Sem isso, o que fica no rodape da pagina — paginacao, botao de
            salvar — termina embaixo dele em telas curtas, e o clique nao pega.
          */}
          <main className="admin-workspace flex-1 px-4 py-5 pb-24 sm:px-6 sm:py-7 sm:pb-24 xl:px-8 xl:py-8 xl:pb-24">
            {children}
          </main>
          <LiveActivityWidget />
        </div>
      </AdminActivityFeedProvider>
    </AuthGate>
  );
}
