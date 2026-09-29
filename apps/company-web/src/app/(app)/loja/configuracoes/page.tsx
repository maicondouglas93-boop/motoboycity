'use client';

import { BairrosDaLoja } from '@/components/loja/bairros-da-loja';
import { ContaAsaas } from '@/components/loja/conta-asaas';
import { EnderecoDaEmpresa } from '@/components/loja/endereco-da-empresa';
import { IdentidadeDaLoja } from '@/components/loja/identidade-da-loja';
import { LinkDaLoja } from '@/components/loja/link-da-loja';
import { PagamentosDaLoja } from '@/components/loja/pagamentos-da-loja';
import { SecaoDeConfiguracao } from '@/components/loja/secao-de-configuracao';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * O link, a aparência, o pagamento e a área de entrega da loja online. Cada
 * cartão grava o seu, como as telas de Horários e Tipos de pedido: salvar os
 * bairros não desfaz a cor que acabou de mudar.
 */
export default function LojaConfiguracoesPage() {
  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1>Configurações da loja</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Horário, tipos de pedido e avisos têm telas próprias, no menu ao lado.
        </p>
      </header>

      {/* O link é o que a loja divulga — e é por ele que a página existe. */}
      <SecaoDeConfiguracao
        titulo="Divulgação"
        descricao="O endereço que você passa aos clientes e a cara da página."
      >
        <LinkDaLoja />
        {/* A logo, o tema e duas cores; o resto é calculado. */}
        <IdentidadeDaLoja />
      </SecaoDeConfiguracao>

      {/* A loja recebe na PRÓPRIA conta; a plataforma não toca no dinheiro de
          ninguém. */}
      <SecaoDeConfiguracao
        titulo="Pagamento"
        descricao="Como o cliente paga e em que conta o dinheiro cai."
      >
        <PagamentosDaLoja />
        <ContaAsaas />
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="Entrega e retirada"
        descricao="Onde a loja entrega, quanto cobra e de onde o motoboy sai."
      >
        <BairrosDaLoja />
        {/* De onde o motoboy retira. NÃO é campo desta tela. */}
        <Card>
          <CardHeader>
            <CardTitle>De onde o motoboy retira</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <EnderecoDaEmpresa />
            <p className="text-xs text-muted-foreground">
              É o mesmo ponto de coleta que a sua empresa já usa nos pedidos do painel, e não uma
              configuração separada da loja. Para alterar, mude o endereço da empresa — a loja
              acompanha.
            </p>
          </CardContent>
        </Card>
      </SecaoDeConfiguracao>
    </div>
  );
}
