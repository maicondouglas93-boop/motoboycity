import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const realRequire = createRequire(import.meta.url);
// Controles de modo/clima reais; apenas primitivas visuais e modal são substituídos.
const ConfirmActionDialog = ({ children }) => children;
const Button = ({ children, disabled, onClick }) =>
  createElement('button', { disabled, onClick }, children);
function load(name) {
  const source = readFileSync(
    new URL(`../src/components/settings/${name}.tsx`, import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (dependency) => {
      if (dependency.startsWith('./')) return load(dependency.slice(2));
      if (dependency === '@/components/admin/confirm-action-dialog') return { ConfirmActionDialog };
      if (dependency === '@/components/ui/button') return { Button };
      if (dependency === '@/components/ui/badge')
        return { Badge: ({ children }) => createElement('span', null, children) };
      return realRequire(dependency);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { SurchargeCard } = load('surcharge-card');
const surcharge = {
  id: 'rate-1',
  name: 'Taxa de chuva',
  active: true,
  activeNow: true,
  manuallyActive: false,
  automaticRainEnabled: true,
  driverSharePercentage: 90,
  schedules: [{ id: 'window-1' }],
  rainAutomation: {
    reference: 'Lajinha–MG',
    status: 'RAINING',
    activeNow: true,
    accessMode: 'PUBLIC',
    observedAt: '2026-09-10T15:00:00Z',
  },
};
const props = (extra = {}) => ({
  surcharge,
  amount: 'R$ 1,05',
  scheduleLabels: [{ id: 'window-1', label: 'Segunda, 18:00 às 23:00' }],
  pending: false,
  onEdit: () => {},
  onModeChange: () => {},
  onManualChange: () => {},
  onActiveChange: async () => {},
  onRemove: async () => {},
  ...extra,
});
const render = (extra) => renderToStaticMarkup(createElement(SurchargeCard, props(extra)));
function find(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, type));
  if (!node || typeof node !== 'object') return [];
  return node.type === type ? [node] : find(node.props?.children, type);
}

test('card prioriza valor, estado e desativação; ID, licença, horários e exclusão ficam recolhidos', () => {
  const html = render();
  const [visible, details] = html.split('<details');
  assert.match(visible, /Taxa de chuva/);
  assert.match(visible, /R\$ 1,05/);
  assert.match(visible, /90<!-- -->% ao entregador|90% ao entregador/);
  assert.match(visible, /Valendo agora/);
  assert.match(visible, /Desativar taxa/);
  assert.doesNotMatch(visible, /ID da taxa|licença|Excluir taxa|18:00/);
  assert.doesNotMatch(details.split('>')[0], /\bopen\b/);
  assert.match(details, /Detalhes e horários/);
  assert.match(details, /ID da taxa: rate-1/);
  assert.match(details, /licença de uso comercial/);
  assert.match(details, /Guardados, sem efeito no modo automático/);
  assert.match(details, /Segunda, 18:00 às 23:00/);
  assert.match(details, /Excluir taxa/);
});

test('estado usa activeNow da API e desativação prevalece, sem inventar chuva para taxa comum', () => {
  assert.match(render({ surcharge: { ...surcharge, activeNow: false } }), /Aguardando ativação/);
  const inactive = render({ surcharge: { ...surcharge, active: false } });
  assert.match(inactive, /Taxa desativada/);
  assert.match(inactive, /Reativar taxa/);
  assert.doesNotMatch(inactive, /Valendo agora/);
  const regular = render({
    surcharge: {
      ...surcharge,
      name: 'Taxa noturna',
      automaticRainEnabled: false,
      rainAutomation: null,
    },
  });
  assert.match(regular, /Ligar manual/);
  assert.doesNotMatch(regular.split('<details')[0], /Clima ·|Chuva indicada pelo modelo/);
});

test('desativação e exclusão mantêm confirmação e propagam erros, sem alterar estado antes da API', async () => {
  const calls = [];
  const tree = SurchargeCard(
    props({
      onActiveChange: async () => {
        calls.push('active');
        throw new Error('Sem conexão');
      },
      onRemove: async () => {
        calls.push('remove');
      },
    }),
  );
  const [active, remove] = find(tree, ConfirmActionDialog);
  assert.deepEqual(calls, []);
  assert.match(active.props.consequence, /inclusive pelo clima e por horários/);
  assert.match(active.props.consequence, /Preços já calculados não mudam/);
  await assert.rejects(active.props.onConfirm(), /Sem conexão/);
  assert.match(render(), /Valendo agora/);
  await remove.props.onConfirm();
  assert.deepEqual(calls, ['active', 'remove']);
});

test('salvamento bloqueia ações e edição continua ligada ao callback', () => {
  let edits = 0;
  const tree = SurchargeCard(props({ onEdit: () => edits++ }));
  find(tree, Button)[0].props.onClick();
  assert.equal(edits, 1);
  assert.equal(
    find(SurchargeCard(props({ pending: true })), Button).every((button) => button.props.disabled),
    true,
  );
  assert.match(render({ pending: true }), /<fieldset[^>]*disabled/);
});
