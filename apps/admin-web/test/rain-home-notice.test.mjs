import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const realRequire = createRequire(import.meta.url);
const ConfirmActionDialog = ({ children }) => children;
function load(relative, overrides) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (name) => overrides[name] ?? realRequire(name),
    mod,
    mod.exports,
  );
  return mod.exports;
}
const { RainHomeNoticeView } = load('../src/components/operations/rain-home-notice-view.tsx', {
  'next/link': { default: ({ children, ...rest }) => createElement('a', rest, children) },
  '@/components/ui/button': {
    Button: ({ children, disabled, onClick }) =>
      createElement('button', { disabled, onClick }, children),
  },
  '@/components/admin/confirm-action-dialog': { ConfirmActionDialog },
});
const rate = {
  id: 'rain-1',
  name: 'Chuva',
  active: true,
  activeNow: true,
  automaticRainEnabled: true,
  rainAutomation: { status: 'RAINING', activeNow: true, observedAt: '2026-09-10T15:00:00Z' },
};
const props = (extra = {}) => ({
  surcharges: [rate],
  unavailable: false,
  pending: false,
  deactivatedId: null,
  onDeactivate: async () => {},
  ...extra,
});
const render = (extra) => renderToStaticMarkup(createElement(RainHomeNoticeView, props(extra)));
function find(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, type));
  if (!node || typeof node !== 'object') return [];
  return node.type === type ? [node] : find(node.props?.children, type);
}

test('home informa chuva estimada e taxa ativa com horário de Brasília e ação direta', () => {
  const html = render();
  assert.match(html, /Chuva indicada em Lajinha/);
  assert.match(html, /ativada para novas cotações/);
  assert.match(html, /Estimativa do Open-Meteo/);
  assert.match(html, /12:00/);
  assert.match(html, /Desativar taxa/);
});

test('sem taxa automática efetivamente ativa, home não inventa aviso', () => {
  for (const changes of [
    { active: false },
    { activeNow: false },
    { automaticRainEnabled: false },
    { rainAutomation: null },
    { rainAutomation: { ...rate.rainAutomation, activeNow: false } },
    { rainAutomation: { ...rate.rainAutomation, status: 'UNAVAILABLE' } },
  ])
    assert.equal(render({ surcharges: [{ ...rate, ...changes }] }), '');
  assert.equal(render({ surcharges: [] }), '');
});

test('período seco não é apresentado como se ainda estivesse chovendo', () => {
  const html = render({
    surcharges: [{ ...rate, rainAutomation: { ...rate.rainAutomation, status: 'DRYING' } }],
  });
  assert.match(html, /Sem nova indicação de chuva/);
  assert.match(html, /30 minutos/);
  assert.doesNotMatch(html, /Chuva indicada em Lajinha/);
});

test('confirmação usa o ID correto e explica persistência; falha não esconde taxa', async () => {
  const ids = [];
  const tree = RainHomeNoticeView(
    props({
      onDeactivate: async (id) => {
        ids.push(id);
        throw new Error('Falha de rede');
      },
    }),
  );
  const [dialog] = find(tree, ConfirmActionDialog);
  assert.match(dialog.props.consequence, /até você reativá-la/);
  assert.match(dialog.props.consequence, /já calculados não mudam/);
  await assert.rejects(dialog.props.onConfirm(), /Falha de rede/);
  assert.deepEqual(ids, ['rain-1']);
  assert.match(render(), /Desativar taxa/);
  assert.match(render({ pending: true }), /<button[^>]*disabled/);
});

test('sucesso só aparece com desativação confirmada e some quando ADM reativa', () => {
  const html = render({
    surcharges: [{ ...rate, active: false, activeNow: false }],
    deactivatedId: rate.id,
  });
  assert.match(html, /Taxa de chuva desativada/);
  assert.match(html, /não vai reativá-la sozinho/);
  assert.doesNotMatch(render({ deactivatedId: rate.id }), /Taxa de chuva desativada/);
});

test('falha de consulta não mostra dados antigos como confirmação', () => {
  const html = render({ unavailable: true });
  assert.match(html, /Não foi possível confirmar/);
  assert.doesNotMatch(html, /ativada para novas cotações|Desativar taxa/);
});

test('home reutiliza consulta de taxas a cada minuto e só confirma após resposta da API', async () => {
  let queryOptions;
  let mutationOptions;
  let remembered;
  const calls = [];
  const cache = [];
  const updated = { ...rate, active: false, activeNow: false };
  const queryClient = {
    setQueryData: (key, update) => cache.push([key, update([rate])]),
    invalidateQueries: (options) => calls.push(['invalidate', options]),
  };
  const { RainHomeNotice } = load('../src/components/operations/rain-home-notice.tsx', {
    react: {
      useState: () => [
        null,
        (id) => {
          remembered = id;
        },
      ],
    },
    '@tanstack/react-query': {
      useQueryClient: () => queryClient,
      useQuery: (options) => {
        queryOptions = options;
        return { data: [rate], isError: false, fetchStatus: 'idle' };
      },
      useMutation: (options) => {
        mutationOptions = options;
        return {
          isPending: false,
          mutateAsync: async (id) => {
            const result = await options.mutationFn(id);
            options.onSuccess(result);
            return result;
          },
        };
      },
    },
    '@/lib/api-client': {
      adminSurchargesApi: {
        list: async () => [rate],
        deactivate: async (token, id) => {
          calls.push(['deactivate', token, id]);
          return updated;
        },
      },
    },
    '@/lib/session': { session: { getToken: () => 'test-token' } },
    './rain-home-notice-view': { RainHomeNoticeView },
  });
  const tree = RainHomeNotice();
  assert.equal(queryOptions.refetchInterval, 60_000);
  assert.equal(queryOptions.refetchIntervalInBackground, false);
  assert.deepEqual(queryOptions.queryKey, ['admin', 'surcharges']);
  assert.equal(remembered, undefined);
  assert.equal(mutationOptions.onMutate, undefined); // sem confirmação otimista
  await tree.props.onDeactivate(rate.id);
  assert.deepEqual(calls[0], ['deactivate', 'test-token', rate.id]);
  assert.equal(remembered, rate.id);
  assert.equal(cache[0][1][0].active, false);
  assert.deepEqual(calls[1], ['invalidate', { queryKey: ['admin', 'surcharges'] }]);
});
