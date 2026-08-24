import { StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { colors } from '../theme/colors';

export type RouteStop = {
  /** `store` e coleta, `pin` e entrega, `flag` e a ultima parada, `return` e o retorno. */
  icon: IconName;
  /** Marca a parada como ja cumprida: o icone vira um check verde. */
  done?: boolean;
  label?: string;
  address: string;
};

/**
 * A linha do tempo da rota: icones empilhados, ligados por uma linha pontilhada.
 *
 * E o desenho que a referencia usa em toda tela que mostra um pedido, e e o que
 * responde a pergunta do motoboy em um relance: onde pego, onde entrego, e o
 * que ja fiz.
 *
 * A linha pontilhada e feita de Views pequenas em vez de borda tracejada
 * porque o Android desenha `borderStyle: 'dashed'` de forma inconsistente entre
 * fabricantes — em alguns some, em outros vira linha cheia.
 */
export function RouteTimeline({
  stops,
  compact = false,
}: {
  stops: ReadonlyArray<RouteStop>;
  compact?: boolean;
}) {
  return (
    <View style={[styles.lista, compact && styles.listaCompacta]}>
      {stops.map((stop, indice) => {
        const ultima = indice === stops.length - 1;
        return (
          <View
            key={`${stop.icon}-${indice}`}
            style={[styles.linha, compact && styles.linhaCompacta]}
          >
            <View style={[styles.coluna, compact && styles.colunaCompacta]}>
              {stop.done ? (
                <Icon name="check" size={compact ? 18 : 22} color={colors.success} />
              ) : (
                <Icon name={stop.icon} size={compact ? 18 : 22} color={colors.actionSoft} />
              )}
              {!ultima && <Pontilhado compact={compact} />}
            </View>

            <View style={[styles.texto, compact && styles.textoCompacto]}>
              {stop.label && (
                <Text style={[styles.rotulo, compact && styles.rotuloCompacto]}>{stop.label}</Text>
              )}
              <Text
                style={[styles.endereco, compact && styles.enderecoCompacto]}
                numberOfLines={compact ? 2 : undefined}
              >
                {stop.address}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Pontilhado({ compact }: { compact: boolean }) {
  const pontos = compact ? [0, 1, 2] : [0, 1, 2, 3];
  return (
    <View style={[styles.pontilhado, compact && styles.pontilhadoCompacto]}>
      {pontos.map((ponto) => (
        <View key={ponto} style={styles.ponto} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: { gap: 2 },
  listaCompacta: { gap: 0 },
  linha: { flexDirection: 'row', gap: 14 },
  linhaCompacta: { gap: 9 },
  coluna: { width: 26, alignItems: 'center' },
  colunaCompacta: { width: 21 },
  pontilhado: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 4, minHeight: 18 },
  pontilhadoCompacto: { paddingVertical: 2, gap: 3, minHeight: 12 },
  ponto: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.inkMuted },
  texto: { flex: 1, paddingBottom: 14, gap: 2 },
  textoCompacto: { paddingBottom: 8, gap: 1 },
  rotulo: { fontSize: 16, fontWeight: '700', color: colors.ink },
  rotuloCompacto: { fontSize: 13 },
  endereco: { fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  enderecoCompacto: { fontSize: 12, lineHeight: 16 },
});
