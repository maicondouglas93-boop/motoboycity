import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  /**
   * Uma linha dizendo o que o número quer dizer.
   *
   * Existe porque valor em dinheiro sozinho não se explica: "R$ 7.951" não
   * conta que são entregas já feitas e ainda não cobradas, que é justamente a
   * informação que faz alguém agir.
   */
  hint?: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
