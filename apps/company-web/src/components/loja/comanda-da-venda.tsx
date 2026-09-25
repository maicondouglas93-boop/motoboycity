import recibo from '@/components/orders/delivery-receipt.module.css';
import type { VendaDaLoja } from '@/lib/loja-mock';
import { etapaParaALoja } from '@/lib/loja-pedido';
import estilos from './comanda-da-venda.module.css';

/**
 * A comanda de uma venda da loja online, para a bobina de 80 mm.
 *
 * Usa o mesmo estilo do cupom de entrega (`delivery-receipt.module.css`), que
 * já foi acertado na Elgin i8/i9: um cupom novo com medidas próprias seria
 * outra rodada de testes na impressora.
 *
 * Diferente do cupom de entrega, esta leva os valores: é o papel que vai com o
 * pedido, e quem entrega precisa saber quanto cobrar e quanto de troco levar.
 */

const dataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const soHora = new Intl.DateTimeFormat('pt-BR', {
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function comoChega(venda: VendaDaLoja): string {
  if (venda.modalidade === 'RETIRADA') return 'Retirada na loja';
  return venda.entregaPor === 'LOJA'
    ? 'Entrega · entregador da loja'
    : 'Entrega · motoboy do MOTOboyCity';
}

export function ComandaDaVenda({
  venda,
  loja,
  impressoEm,
}: {
  venda: VendaDaLoja;
  loja: string;
  impressoEm: string;
}) {
  const feitaEm = venda.historico[0]?.em ?? impressoEm;
  const somaDosItens = venda.itens.reduce((soma, item) => soma + item.total, 0);
  // A venda guarda o total; o que passa da soma dos itens é a taxa de entrega.
  const taxa = Math.round((venda.total - somaDosItens) * 100) / 100;
  // O mesmo critério da tela de Vendas: na integração, a forma de pagamento
  // chega como código, e não como texto.
  const pagoOnline = venda.pagamento.toLowerCase().includes('online');
  const troco = venda.trocoPara === null ? 0 : venda.trocoPara - venda.total;

  return (
    <article className={recibo['receipt']} aria-label={`Comanda do pedido #${venda.numero}`}>
      <header className={recibo['heading']}>
        <p className={recibo['store']}>{loja}</p>
        <h1>PEDIDO #{venda.numero}</h1>
        <p>{comoChega(venda)}</p>
        <p>{dataHora.format(new Date(feitaEm))} (Brasília)</p>
        <p>
          <strong>{etapaParaALoja(venda.etapa, venda.modalidade)}</strong>
        </p>
      </header>

      {venda.janela && (
        <p className={estilos['destaque']}>
          AGENDADO: {dataHora.format(new Date(venda.janela.inicio))} a{' '}
          {soHora.format(new Date(venda.janela.fim))}
        </p>
      )}

      <section className={recibo['section']}>
        <h2>ITENS</h2>
        <ul className={estilos['itens']}>
          {venda.itens.map((item, indice) => (
            <li key={`${indice}-${item.nome}`}>
              <p className={estilos['linha']}>
                <span>
                  <strong>{item.quantidade}×</strong> {item.nome}
                  {item.tamanho && ` — ${item.tamanho}`}
                </span>
                <span>{moeda(item.total)}</span>
              </p>
              {item.escolhas.length > 0 && (
                <p className={estilos['escolhas']}>{item.escolhas.join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {venda.observacao?.trim() && (
        <section className={recibo['section']}>
          <h2>OBSERVAÇÃO DO CLIENTE</h2>
          <p className={recibo['notes']}>{venda.observacao}</p>
        </section>
      )}

      <section className={recibo['section']}>
        <h2>CLIENTE</h2>
        <p>{venda.cliente}</p>
        <p>{venda.telefone}</p>
      </section>

      {venda.entrega && (
        <section className={recibo['section']}>
          <h2>ENDEREÇO DE ENTREGA</h2>
          <p>
            {venda.entrega.rua}, {venda.entrega.numero}
            {venda.entrega.complemento && ` — ${venda.entrega.complemento}`}
          </p>
          <p>
            {venda.entrega.bairro} — {venda.entrega.cidade}/{venda.entrega.estado}
          </p>
          {venda.entrega.cep && <p>CEP {venda.entrega.cep}</p>}
          {venda.entrega.referencia && (
            <p>
              <strong>Referência:</strong> {venda.entrega.referencia}
            </p>
          )}
        </section>
      )}

      <section className={recibo['section']}>
        <h2>PAGAMENTO</h2>
        <p className={estilos['linha']}>
          <span>Itens</span>
          <span>{moeda(somaDosItens)}</span>
        </p>
        {taxa > 0 && (
          <p className={estilos['linha']}>
            <span>Taxa de entrega</span>
            <span>{moeda(taxa)}</span>
          </p>
        )}
        <p className={`${estilos['linha']} ${estilos['total']}`}>
          <span>TOTAL</span>
          <span>{moeda(venda.total)}</span>
        </p>
        <p>{venda.pagamento}</p>
        {/* O que quem entrega faz com o dinheiro: nada, ou cobrar — e com
            quanto de troco no bolso. */}
        <p className={estilos['destaque']}>
          {pagoOnline
            ? 'JÁ PAGO — NÃO COBRAR'
            : `COBRAR ${moeda(venda.total)} NA ${venda.modalidade === 'ENTREGA' ? 'ENTREGA' : 'RETIRADA'}`}
        </p>
        {venda.trocoPara !== null && (
          <p className={estilos['destaque']}>
            TROCO PARA {moeda(venda.trocoPara)}
            {troco > 0 && ` — levar ${moeda(troco)}`}
          </p>
        )}
      </section>

      <footer className={recibo['footer']}>
        <p>IMPRESSO EM: {dataHora.format(new Date(impressoEm))} (Brasília)</p>
        <p>Pedido da loja online · Não é documento fiscal</p>
      </footer>
    </article>
  );
}
