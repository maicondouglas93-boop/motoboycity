import { Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { mockIntegrations } from '@/lib/mock-data';

export default function AdminIntegrationsPage() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">Integrações Disponíveis</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {mockIntegrations.map((integration) => (
          <Card key={integration} className="cursor-pointer transition-colors hover:bg-accent">
            <CardContent className="flex items-center gap-3 py-4">
              <Plug className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{integration}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
