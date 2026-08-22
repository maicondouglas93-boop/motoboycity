/**
 * A área que a operação atende.
 *
 * Serve de referência tanto para abrir o mapa quanto para ordenar as sugestões
 * de endereço, e por isso vive fora dos dois — o valor estava duplicado em cada
 * componente que precisava dele.
 */

/**
 * Centro de Lajinha, obtido pelo geocoder do próprio Google e não estimado:
 * `Lajinha, MG, 36980-000, Brasil` responde -20.15221, -41.62322.
 */
export const LAJINHA_CENTER = { lat: -20.15221, lng: -41.62322 } as const;

/**
 * Raio usado para puxar as sugestões de endereço para perto.
 *
 * O valor foi medido contra o Google, não escolhido por intuição. Digitando
 * "aven":
 *
 * | configuração        | resultado                              |
 * | ------------------- | -------------------------------------- |
 * | viés de 20 km       | Lajinha em 5º, atrás de Iúna e Ibatiba |
 * | **viés de 5 km**    | **as cinco sugestões são de Lajinha**  |
 * | restrito a 30 km    | Avenida Paulista em 1º, Lajinha ausente |
 *
 * O raio largo não bastava porque o Google ordena por relevância global, e
 * cidade maior ganha sempre — a Avenida Paulista aparecia mesmo a 800 km.
 *
 * A última linha é o achado contraintuitivo: `strictBounds` saiu **pior** que o
 * viés apertado, filtrando a área mas mantendo a ordenação global. Além de
 * inferior, travaria o pedido para outra cidade, já que o formulário exige uma
 * sugestão do Google para submeter. Por isso é viés, não filtro: com 5 km,
 * "Avenida Paulista Sao Paulo" e "Rua Sete de Setembro Ibatiba" continuam
 * achando o que a pessoa pediu.
 */
export const SUGGESTION_BIAS_RADIUS_METERS = 5_000;
