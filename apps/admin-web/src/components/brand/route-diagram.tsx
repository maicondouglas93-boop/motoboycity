const STEPS = [
  { label: 'Coleta', hint: 'na sua loja' },
  { label: 'Em rota', hint: 'a caminho do cliente' },
  { label: 'Entregue', hint: 'confirmado pelo GPS' },
] as const;

/**
 * Elemento de assinatura: o ciclo real da entrega desenhado como uma rota.
 *
 * Não é ornamento — são os três estados que o pedido percorre de verdade, na
 * ordem em que acontecem, e é o único lugar da tela onde gasto cor forte e
 * movimento. O nó do meio é o único âmbar porque é o único em movimento; a
 * animação para quando o sistema pede movimento reduzido.
 */
export function RouteDiagram({ className = '' }: { className?: string }) {
  return (
    <ol className={`space-y-0 ${className}`} aria-label="Ciclo de uma entrega">
      {STEPS.map((step, index) => {
        const isActive = index === 1;
        const isLast = index === STEPS.length - 1;

        return (
          <li key={step.label} className="grid grid-cols-[auto_1fr] gap-x-4">
            <div className="flex flex-col items-center">
              <span
                className={
                  isActive
                    ? 'relative size-2.5 rounded-full bg-colete'
                    : 'size-2.5 rounded-full border border-white/35'
                }
              >
                {isActive && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-colete opacity-60 motion-reduce:hidden" />
                )}
              </span>
              {!isLast && <span className="my-1 w-px flex-1 bg-white/20" aria-hidden="true" />}
            </div>

            <div className={isLast ? 'pb-0' : 'pb-6'}>
              <p
                className={`text-sm leading-none font-medium ${isActive ? 'text-colete' : 'text-white/80'}`}
              >
                {step.label}
              </p>
              <p className="mt-1.5 text-xs text-white/45">{step.hint}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
