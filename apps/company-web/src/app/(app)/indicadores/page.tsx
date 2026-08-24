import { redirect } from 'next/navigation';

/** Compatibilidade para favoritos e links antigos, sem manter duas telas iguais. */
export default function LegacyIndicatorsPage() {
  redirect('/relatorios/geral');
}
