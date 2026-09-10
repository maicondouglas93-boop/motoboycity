import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Renderização real, sem rede, sessão administrativa ou API de produção.
const source = readFileSync(
  new URL('../src/components/settings/rain-automation-status.tsx', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', compiled)(
  createRequire(import.meta.url),
  componentModule,
  componentModule.exports,
);
const { RainAutomationStatus, RainAutomationDetails } = componentModule.exports;
const automation = {
  reference: 'Lajinha–MG',
  status: 'RAINING',
  activeNow: true,
  accessMode: 'PUBLIC',
  observedAt: '2026-09-10T15:00:00Z',
  checkedAt: '2026-09-10T15:02:00Z',
  drySince: null,
  rainMm: 0.1,
};
const render = (props = {}) =>
  renderToStaticMarkup(
    createElement(RainAutomationStatus, {
      automation,
      enabled: true,
      automaticEnabled: true,
      ...props,
    }),
  );

test('resumo mostra estimativa em Lajinha e hora de Brasília, sem detalhes técnicos', () => {
  const html = render();
  assert.match(html, /Lajinha–MG/);
  assert.match(html, /Chuva indicada pelo modelo/);
  assert.match(html, /Estimativa regional, não confirmação na rua/);
  assert.doesNotMatch(html, /Endpoint público|licença|geocoding/);
  assert.match(html, /12:00/);
  assert.doesNotMatch(html, /15:00/);
});

test('detalhes preservam fonte, licença e instrução de vínculo quando necessário', () => {
  const details = (automation) =>
    renderToStaticMarkup(createElement(RainAutomationDetails, { automation }));
  assert.match(details(automation), /Endpoint público sem chave/);
  assert.match(details(automation), /licença de uso comercial/);
  assert.match(details(automation), /https:\/\/open-meteo.com\//);
  assert.doesNotMatch(details({ ...automation, accessMode: 'COMMERCIAL' }), /Endpoint público/);
  assert.match(details(null), /vincule o ID desta taxa/);
});
test('desativação do ADM prevalece visualmente sobre chuva ativa', () => {
  const html = render({ enabled: false });
  assert.match(html, /Taxa desativada pelo ADM/);
  assert.doesNotMatch(html, /Chuva indicada pelo modelo|use Desativar taxa/);
});
test('falha e espera não são apresentadas como confirmação de chuva', () => {
  assert.match(
    render({ automation: { ...automation, status: 'UNAVAILABLE' } }),
    /Sem dados recentes/,
  );
  assert.match(render({ automation: { ...automation, status: 'DRYING' } }), /30 minutos/);
});

test('modo Manual não apresenta chuva como cobrança em vigor', () => {
  const html = render({ automaticEnabled: false });
  assert.match(html, /Modo Manual: o clima não aplica esta taxa/);
  assert.doesNotMatch(html, /Chuva indicada pelo modelo|use Desativar taxa/);
});
