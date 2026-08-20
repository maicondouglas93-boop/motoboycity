import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const settings = [
  {
    href: '/configuracoes/tipos-de-servico',
    title: 'Tipos de serviços',
    description: 'Cadastre e mantenha as modalidades que podem ser atribuídas aos entregadores.',
  },
  {
    href: '/configuracoes/tabela-de-precos',
    title: 'Tabelas de preços',
    description: 'Consulte e altere os valores que são congelados na criação de cada pedido.',
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Configurações operacionais</h1>
        <p className="text-sm text-muted-foreground">
          Apenas configurações que possuem rota e operação real estão disponíveis aqui.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {settings.map((setting) => (
          <Link key={setting.href} href={setting.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardContent className="flex gap-3 py-5">
                <Settings className="size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">{setting.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{setting.description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
