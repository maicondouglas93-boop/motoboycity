'use client';

import { ManagePageProtectionsCard } from '@/components/page-protection/manage-page-protections-card';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-portal-deep">
          Configurações da Empresa
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie permissões de segurança e proteções de acesso do seu painel.
        </p>
      </div>

      <ManagePageProtectionsCard />
    </div>
  );
}
