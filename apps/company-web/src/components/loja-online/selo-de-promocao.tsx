import { textoSobre } from './paleta';

/**
 * O selo da promoção ("20% OFF", "Leve 3, pague 2"). Na cor de ação da loja, a
 * mesma do botão de adicionar: a oferta chama a atenção sem trazer uma cor que
 * não é da marca.
 */
export function SeloDePromocao({ rotulo, corDeAcao }: { rotulo: string; corDeAcao: string }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[11px] leading-none font-bold"
      style={{ backgroundColor: corDeAcao, color: textoSobre(corDeAcao) }}
    >
      {rotulo}
    </span>
  );
}
