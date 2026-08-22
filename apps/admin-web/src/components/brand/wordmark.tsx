/**
 * Marca nominal. A largura expandida do Archivo é o que dá o ar de letreiro
 * de sinalização, e o âmbar em "CITY" ancora a cor da marca já no primeiro
 * contato — a mesma cor que, dentro do produto, significa "em movimento".
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`font-heading inline-flex items-baseline text-[15px] leading-none font-extrabold tracking-[0.14em] uppercase ${className}`}
      style={{ fontStretch: '125%' }}
    >
      <span>Motoboy</span>
      <span className="text-colete">City</span>
    </span>
  );
}
