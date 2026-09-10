# Artes da navegação — Admin Web

Geradas em 2026-09-10 com o recurso integrado `image_gen`, sem CLI/API própria.
As quatro artes adicionais completam as quatro reaproveitadas do Company Web.
A primeira tentativa retornou limite de uso após gerar Visão geral e Entregadores;
a nova tentativa pedida pelo responsável gerou Secretária IA e Configurações.
Nenhuma arte ficou pendente. Originais transparentes copiados sem edição; o header
e o menu compacto usam Next Image em 32 × 32 px, com `sizes="32px"`.
Nomes continuam visíveis e imagens são decorativas (`alt=""`).

## Arquivos finais

Todos em `apps/admin-web/public/brand/navigation/`:

| Menu | Arquivo | Origem |
|---|---|---|
| Visão geral | `visao-geral-v1.png` | Geração nova |
| Pedidos | `pedidos-v1.png` | Cópia idêntica do Company Web |
| Entregadores | `entregadores-v1.png` | Geração nova |
| Clientes | `clientes-v1.png` | Cópia idêntica do Company Web |
| Financeiro | `financeiro-v1.png` | Cópia idêntica do Company Web |
| Relatórios | `relatorios-v1.png` | Cópia idêntica do Company Web |
| Secretária IA | `secretaria-ia-v1.png` | Geração nova |
| Configurações | `configuracoes-v1.png` | Geração nova |

Prompts das artes reaproveitadas em `company-nav-illustrations.md`.

## Medição local

Somatório dos corpos das oito respostas WebP do otimizador Next, qualidade 75:
32 px: **7.440 bytes**; 64 px: **15.128 bytes**; 96 px: **22.962 bytes**.
Não inclui cabeçalhos HTTP, marca ou outros recursos da página. Os PNGs originais
são maiores e ficam no projeto; não desativar a otimização nem servi-los diretamente
no menu. As duas versões de navegação usam os mesmos caminhos, sem novos serviços,
bibliotecas ou chamadas à API de negócio.

## Prompts finais das quatro novas artes

### visao-geral-v1.png

```text
Use case: stylized-concept.
Asset type: small navigation illustration for the Brazilian delivery platform MOTOboyCity.
Primary request: create ONE polished miniature 3D clay illustration for a website header, recognizable when displayed at only 32px.
Style: charming premium soft 3D, simple solid rounded shapes, restrained smooth matte surfaces, crisp silhouette, gentle directional lighting from upper left, very minimal shading. Consistent restrained palette: warm orange #FDA02E, deep teal #14696F, warm ivory #FFF8EB. Mostly orange and ivory so the illustration reads on a dark teal header.
Composition: square canvas, isolated subject centered, taking up 85% of canvas width/height with even small safe padding, front three-quarter view. Actual transparent alpha background; no floor, scene, enclosing tile, text, letters, numbers, watermark or drop shadow outside subject. No tiny decorations, no photorealism, no heavy texture.
Subject: Four compact rounded dashboard tiles arranged in a tight 2 by 2 grid, two ivory tiles, one orange tile and one teal tile. Slight 3D depth, coherent simple square dashboard silhouette, blank tiles without symbols.
```

### entregadores-v1.png

```text
Use case: stylized-concept.
Asset type: small navigation illustration for the Brazilian delivery platform MOTOboyCity.
Primary request: create ONE polished miniature 3D clay illustration for a website header, recognizable when displayed at only 32px.
Style: charming premium soft 3D, simple solid rounded shapes, restrained smooth matte surfaces, crisp silhouette, gentle directional lighting from upper left, very minimal shading. Consistent restrained palette: warm orange #FDA02E, deep teal #14696F, warm ivory #FFF8EB. Mostly orange and ivory so the illustration reads on a dark teal header.
Composition: square canvas, isolated subject centered, taking up 85% of canvas width/height with even small safe padding, front three-quarter view. Actual transparent alpha background; no floor, scene, enclosing tile, text, letters, numbers, watermark or drop shadow outside subject. No tiny decorations, no photorealism, no heavy texture.
Subject: One friendly compact motorcycle helmet in warm ivory, with a large deep teal visor and an orange stripe. Rounded clean silhouette, iconic motorcycle courier helmet. No person, no lettering, no brands.
```

### secretaria-ia-v1.png

```text
Use case: stylized-concept.
Asset type: small navigation illustration for the Brazilian delivery platform MOTOboyCity.
Primary request: create ONE polished miniature 3D clay illustration for a website header, recognizable when displayed at only 32px.
Style: charming premium soft 3D, simple solid rounded shapes, restrained smooth matte surfaces, crisp silhouette, gentle directional lighting from upper left, very minimal shading. Consistent restrained palette: warm orange #FDA02E, deep teal #14696F, warm ivory #FFF8EB. Mostly orange and ivory so the illustration reads on a dark teal header.
Composition: square canvas, isolated subject centered, taking up 85% of canvas width/height with even small safe padding, front three-quarter view. Actual transparent alpha background; no floor, scene, enclosing tile, text, letters, numbers, watermark or drop shadow outside subject. No tiny decorations, no photorealism, no heavy texture.
Subject: One friendly small assistant robot head, warm ivory rounded shell, deep teal faceplate with exactly two simple glowing orange round eyes and one short orange antenna. No mouth, body, text or additional objects.
```

### configuracoes-v1.png

```text
Use case: stylized-concept.
Asset type: small navigation illustration for the Brazilian delivery platform MOTOboyCity.
Primary request: create ONE polished miniature 3D clay illustration for a website header, recognizable when displayed at only 32px.
Style: charming premium soft 3D, simple solid rounded shapes, restrained smooth matte surfaces, crisp silhouette, gentle directional lighting from upper left, very minimal shading. Consistent restrained palette: warm orange #FDA02E, deep teal #14696F, warm ivory #FFF8EB. Mostly orange and ivory so the illustration reads on a dark teal header.
Composition: square canvas, isolated subject centered, taking up 85% of canvas width/height with even small safe padding, front three-quarter view. Actual transparent alpha background; no floor, scene, enclosing tile, text, letters, numbers, watermark or drop shadow outside subject. No tiny decorations, no photorealism, no heavy texture.
Subject: One chunky orange gear with six large rounded teeth, an ivory center ring and a deep teal center hub. Simple front three-quarter view, very clean compact silhouette, no other objects.
```
