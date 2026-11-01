import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const realRequire = createRequire(import.meta.url);

let filterState = {
  regionId: '',
  selectedRegion: null,
  regions: [
    { id: 'reg-lajinha', name: 'Lajinha', active: true, maxDeliveryDistanceKm: 15, companyCount: 12, driverCount: 5 },
    { id: 'reg-manhuacu', name: 'Manhuaçu', active: true, maxDeliveryDistanceKm: 20, companyCount: 4, driverCount: 2 },
  ],
  isLoading: false,
  setRegionId: () => {},
};
const calls = [];
const router = { push: (href) => calls.push(['push', href]) };
const Trigger = ({ children, ...props }) => createElement('button', props, children);
const Item = ({ children, ...props }) => createElement('button', { ...props, 'data-item': 'true' }, children);
const passthrough = ({ children }) => createElement('div', null, children);
const ui = {
  DropdownMenu: passthrough,
  DropdownMenuContent: passthrough,
  DropdownMenuGroup: passthrough,
  DropdownMenuItem: Item,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: Trigger,
};

const selectorCompiled = ts.transpileModule(
  readFileSync(new URL('../src/components/layout/region-selector.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const selectorMod = { exports: {} };
new Function('require', 'module', 'exports', selectorCompiled)((dependency) => {
  if (dependency === 'next/navigation') return { useRouter: () => router };
  if (dependency === '@/components/ui/dropdown-menu') return ui;
  if (dependency === '@/lib/region-filter') return { useAdminRegionFilter: () => filterState };
  return realRequire(dependency);
}, selectorMod, selectorMod.exports);
const { RegionSelector } = selectorMod.exports;

const filterCompiled = ts.transpileModule(
  readFileSync(new URL('../src/lib/region-filter.tsx', import.meta.url), 'utf8'),
  {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const filterMod = { exports: {} };
new Function('require', 'module', 'exports', filterCompiled)((dependency) => {
  if (dependency === '@tanstack/react-query') return { useQuery: () => ({ data: undefined, isLoading: false }) };
  if (dependency === './api-client') return { adminRegionsApi: { list: async () => [] } };
  if (dependency === './session') return { session: { getToken: () => null } };
  return realRequire(dependency);
}, filterMod, filterMod.exports);
const { normalizeSelectedRegionId } = filterMod.exports;

function find(node, predicate) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
  if (!node || typeof node !== 'object') return [];
  const matches = predicate(node) ? [node] : [];
  return [...matches, ...find(node.props?.children, predicate)];
}

test('normalizeSelectedRegionId preserva cidade válida e limpa cidade removida', () => {
  const regions = [{ id: 'reg-lajinha' }, { id: 'reg-manhuacu' }];
  assert.equal(normalizeSelectedRegionId('', regions), '');
  assert.equal(normalizeSelectedRegionId('reg-lajinha', undefined), 'reg-lajinha');
  assert.equal(normalizeSelectedRegionId('reg-lajinha', regions), 'reg-lajinha');
  assert.equal(normalizeSelectedRegionId('reg-inexistente', regions), '');
});

test('RegionSelector exibe Todas as cidades por padrão e permite trocar ou gerenciar cidades', () => {
  calls.length = 0;
  filterState = {
    ...filterState,
    regionId: '',
    selectedRegion: null,
    setRegionId: (id) => calls.push(['region', id]),
  };

  const tree = RegionSelector();
  const html = renderToStaticMarkup(tree);
  assert.match(html, /Cidade selecionada: Todas as cidades/);
  assert.match(html, /Lajinha/);
  assert.match(html, /Manhuaçu/);
  assert.match(html, /16 empresa\(s\) · 7 entregador\(es\)/);

  const items = find(tree, (node) => node.type === Item);
  assert.equal(items.length, 4);
  items[1].props.onClick();
  items[0].props.onClick();
  items[3].props.onClick();

  assert.deepEqual(calls, [
    ['region', 'reg-lajinha'],
    ['region', ''],
    ['push', '/configuracoes/regioes'],
  ]);
});

test('RegionSelector destaca a cidade ativa quando filtrada', () => {
  filterState = {
    ...filterState,
    regionId: 'reg-manhuacu',
    selectedRegion: filterState.regions[1],
  };

  const html = renderToStaticMarkup(RegionSelector());
  assert.match(html, /Cidade selecionada: Manhuaçu/);
});
