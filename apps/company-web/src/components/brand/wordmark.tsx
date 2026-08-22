import Image from 'next/image';

/**
 * Marca nominal oficial.
 *
 * O arquivo tem conteúdo branco (o "M" e "MOTOBOY"), então **só funciona sobre
 * fundo escuro** — por isso ele aparece apenas no painel asfalto e na barra de
 * navegação, nunca sobre o fundo claro das telas.
 *
 * O preto original foi removido tratando a luminância como alfa, o que
 * preservou o antialias das bordas; um limiar simples teria deixado franja
 * escura em volta das letras.
 */
export function Wordmark({ className = '', height = 26 }: { className?: string; height?: number }) {
  // Proporção do arquivo: 507x164.
  const width = Math.round((height * 507) / 164);

  return (
    <Image
      src="/brand/motoboycity-logo.png"
      alt="MOTOboyCity"
      width={width}
      height={height}
      priority
      className={className}
    />
  );
}
