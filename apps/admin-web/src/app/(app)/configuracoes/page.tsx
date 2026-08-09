import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { mockConfigCategories } from '@/lib/mock-data';

const realRoutes: Record<string, string> = {
  'Tabela de Preços': '/configuracoes/tabela-de-precos',
  'Tipos de Serviços': '/configuracoes/tipos-de-servico',
};

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      {mockConfigCategories.map((category, index) => (
        <div key={index} className="space-y-3">
          {category.title && (
            <h2 className="text-sm font-semibold text-muted-foreground">{category.title}</h2>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {category.items.map((item) => {
              const href = realRoutes[item];
              const card = (
                <Card
                  className={href ? 'cursor-pointer transition-colors hover:bg-accent' : 'opacity-60'}
                >
                  <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
                    <Settings className="size-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{item}</span>
                  </CardContent>
                </Card>
              );
              return href ? (
                <Link key={item} href={href}>
                  {card}
                </Link>
              ) : (
                <div key={item}>{card}</div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
