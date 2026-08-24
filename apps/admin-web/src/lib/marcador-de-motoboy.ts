/**
 * Retrato circular do motoboy, para usar como marcador no mapa.
 *
 * O Google Maps clássico aceita imagem no ícone, mas não recorta: uma foto
 * quadrada vira um quadrado no mapa. Então o retrato é composto num `canvas` e
 * entregue como `data:` URL — círculo, anel branco e sombra, no mesmo desenho
 * que o ponto colorido tinha antes.
 *
 * O marcador avançado do Google (`AdvancedMarkerElement`) aceitaria HTML e
 * dispensaria tudo isto, mas exige a biblioteca `marker` e um `mapId`
 * configurado no Google Cloud. Enquanto isso não existe, o canvas resolve sem
 * pedir nada a ninguém.
 */

const TAMANHO = 96;
const ANEL = 8;

/** Cache por chave: recompor o mesmo retrato a cada atualização pisca o mapa. */
const cache = new Map<string, string>();

/**
 * As iniciais de um nome, no máximo duas.
 *
 * "Franklim melo" vira "FM"; "Franklim" vira "F". Nome vazio vira "?" em vez de
 * um círculo mudo — se chegou aqui sem nome, isso é um dado para olhar.
 */
export function iniciaisDoNome(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0]!.charAt(0).toUpperCase();
  return (partes[0]!.charAt(0) + partes[partes.length - 1]!.charAt(0)).toUpperCase();
}

/** Recorta o canvas num circulo, para o que vier depois nao vazar dos cantos. */
function desenharMoldura(contexto: CanvasRenderingContext2D, espessuraDoAnel: number): void {
  const meio = TAMANHO / 2;
  contexto.save();
  contexto.beginPath();
  contexto.arc(meio, meio, meio - espessuraDoAnel, 0, Math.PI * 2);
  contexto.closePath();
  contexto.clip();
}

function fecharMoldura(
  contexto: CanvasRenderingContext2D,
  corDoAnel: string,
  espessuraDoAnel: number,
): void {
  contexto.restore();
  const meio = TAMANHO / 2;
  contexto.beginPath();
  contexto.arc(meio, meio, meio - espessuraDoAnel / 2, 0, Math.PI * 2);
  contexto.lineWidth = espessuraDoAnel;
  contexto.strokeStyle = corDoAnel;
  contexto.stroke();
}

/** Retrato de iniciais, no tom do motoboy. Não depende de rede nenhuma. */
function retratoDeIniciais(nome: string, cor: string, corDoAnel: string, anel: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = TAMANHO;
  canvas.height = TAMANHO;
  const contexto = canvas.getContext('2d');
  if (!contexto) return '';

  const meio = TAMANHO / 2;
  desenharMoldura(contexto, anel);
  contexto.fillStyle = cor;
  contexto.fillRect(0, 0, TAMANHO, TAMANHO);
  contexto.fillStyle = '#ffffff';
  contexto.font = `600 ${TAMANHO * 0.38}px "Segoe UI", system-ui, sans-serif`;
  contexto.textAlign = 'center';
  contexto.textBaseline = 'middle';
  // O deslocamento compensa a altura da caixa da fonte: sem ele as letras
  // ficam visivelmente altas dentro do circulo.
  contexto.fillText(iniciaisDoNome(nome), meio, meio + TAMANHO * 0.02);
  fecharMoldura(contexto, corDoAnel, anel);

  return canvas.toDataURL('image/png');
}

/** Carrega a foto respeitando CORS, para o canvas não ficar contaminado. */
function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rejeitar) => {
    const imagem = new Image();
    /**
     * Sem `crossOrigin`, desenhar a foto no canvas marca ele como contaminado e
     * `toDataURL` passa a lançar — o marcador sumiria em vez de cair para as
     * iniciais. Com isto, o erro acontece no carregamento, onde há recuo.
     */
    imagem.crossOrigin = 'anonymous';
    imagem.onload = () => resolver(imagem);
    imagem.onerror = () => rejeitar(new Error('Falha ao carregar a foto do motoboy.'));
    imagem.src = url;
  });
}

/**
 * O retrato do motoboy para o marcador.
 *
 * Devolve sempre alguma coisa: se a foto não existe, não carrega, ou vem de uma
 * origem que recusa CORS, entrega as iniciais. Um marcador que some porque a
 * foto falhou seria pior do que nunca ter tido foto.
 */
export async function retratoDoMotoboy({
  nome,
  avatarUrl,
  cor,
  selecionado,
}: {
  nome: string;
  avatarUrl: string | null;
  cor: string;
  selecionado: boolean;
}): Promise<string> {
  const corDoAnel = selecionado ? cor : '#ffffff';
  const anel = selecionado ? ANEL * 1.5 : ANEL;
  const chave = `${avatarUrl ?? nome}|${cor}|${corDoAnel}|${anel}`;
  const guardado = cache.get(chave);
  if (guardado) return guardado;

  let resultado: string;
  if (!avatarUrl) {
    resultado = retratoDeIniciais(nome, cor, corDoAnel, anel);
  } else {
    try {
      const imagem = await carregarImagem(avatarUrl);
      const canvas = document.createElement('canvas');
      canvas.width = TAMANHO;
      canvas.height = TAMANHO;
      const contexto = canvas.getContext('2d');
      if (!contexto) return retratoDeIniciais(nome, cor, corDoAnel, anel);

      desenharMoldura(contexto, anel);
      // `cover`: recorta o lado maior em vez de espremer a foto. Rosto
      // achatado num circulo de 96px fica pior do que rosto cortado.
      const lado = Math.min(imagem.width, imagem.height);
      contexto.drawImage(
        imagem,
        (imagem.width - lado) / 2,
        (imagem.height - lado) / 2,
        lado,
        lado,
        0,
        0,
        TAMANHO,
        TAMANHO,
      );
      fecharMoldura(contexto, corDoAnel, anel);
      resultado = canvas.toDataURL('image/png');
    } catch {
      resultado = retratoDeIniciais(nome, cor, corDoAnel, anel);
    }
  }

  cache.set(chave, resultado);
  return resultado;
}
