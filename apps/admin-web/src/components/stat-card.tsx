import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  hint,
  changePercent = null,
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
  /**
   * Variação percentual contra o período anterior. `null` quando a base é zero
   * — ali não há tendência a mostrar, e um número daria a impressão contrária.
   */
  changePercent?: number | null;
}) {
  return (
    <Card className="metric-card h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-mono text-2xl font-semibold tracking-[-0.045em] text-admin-deep tabular-nums">
          {value}
        </p>
        {changePercent !== null && (
          <p
            className={`mt-1 text-xs ${changePercent < 0 ? 'text-alerta' : 'text-status-entregue'}`}
          >
            {changePercent < 0 ? '↓' : '↑'} {Math.abs(changePercent).toLocaleString('pt-BR')}%{' '}
            <span className="text-muted-foreground">vs período anterior (até agora)</span>
          </p>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
