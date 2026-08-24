import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="metric-card min-h-28">
      <CardHeader className="pb-2">
        <CardTitle className="pr-6 text-xs font-semibold tracking-[0.035em] text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-heading text-2xl font-bold tracking-[-0.035em] text-portal-deep">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
