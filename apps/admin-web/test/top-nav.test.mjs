import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const realRequire = createRequire(import.meta.url);
let pathname = '/';
const calls = [];
const router = { push: (href) => calls.push(href), replace: (href) => calls.push(href) };
const Link = ({ children, ...props }) => createElement('a', props, children);
const Item = ({ children, ...props }) => createElement('button', props, children);
const passthrough = ({ children }) => createElement('div', null, children);
const ui = Object.fromEntries([
  'DropdownMenu', 'DropdownMenuContent', 'DropdownMenuGroup', 'DropdownMenuItem',
  'DropdownMenuLabel', 'DropdownMenuSeparator', 'DropdownMenuTrigger',
].map((key) => [key, key === 'DropdownMenuItem' ? Item : passthrough]));
const compiled = ts.transpileModule(readFileSync(
  new URL('../src/components/layout/top-nav.tsx', import.meta.url), 'utf8',
), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', compiled)((dependency) => {
  if (dependency === 'next/link') return { default: Link };
  if (dependency === 'next/navigation') return { usePathname: () => pathname, useRouter: () => router };
  if (dependency === '@tanstack/react-query') return { useQueryClient: () => ({ clear: () => calls.push('clear-cache') }) };
  if (dependency === '@/components/ui/dropdown-menu') return ui;
  if (dependency === '@/components/ui/avatar') return { Avatar: passthrough, AvatarFallback: passthrough };
  if (dependency === '@/components/brand/wordmark') return { Wordmark: () => 'MOTOboyCity' };
  if (dependency === '@/components/layout/notification-bell') return { NotificationBell: () => null };
  if (dependency === '@/lib/money') return { useMoneyVisibility: () => ({ hidden: false, toggle: () => calls.push('toggle-money') }) };
  if (dependency === '@/lib/api-client') return { notificationsApi: { forAdmin: () => {} } };
  if (dependency === '@/lib/session') return { session: { getToken: () => null, clearToken: () => calls.push('clear-token') } };
  return realRequire(dependency);
}, mod, mod.exports);
const { TopNav } = mod.exports;

function find(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, type));
  if (!node || typeof node !== 'object') return [];
  return node.type === type ? [node] : find(node.props?.children, type);
}
const destinations = [
  ['/', 'Visão geral', 'visao-geral'],
  ['/pedidos', 'Pedidos', 'pedidos'],
  ['/entregadores', 'Entregadores', 'entregadores'],
  ['/clientes', 'Clientes', 'clientes'],
  ['/financeiro', 'Financeiro', 'financeiro'],
  ['/relatorios', 'Relatórios', 'relatorios'],
  ['/secretaria-virtual', 'Secretária IA', 'secretaria-ia'],
  ['/configuracoes', 'Configurações', 'configuracoes'],
];

for (const [href, label, slug] of destinations) {
  test(`${label}: nome visível, rota e estado ativo com arte local otimizada`, () => {
    pathname = href === '/' ? '/' : `${href}/detalhe`;
    const [nav] = find(TopNav(), 'nav');
    const links = find(nav, Link);
    assert.equal(links.length, 8);
    const active = links.filter((link) => link.props['aria-current'] === 'page');
    assert.equal(active.length, 1);
    assert.equal(active[0].props.href, href);
    const html = renderToStaticMarkup(active[0]);
    assert.ok(html.includes(label));
    assert.match(html, /alt=""/);
    assert.match(html, /width="32"/);
    assert.match(html, /height="32"/);
    assert.match(html, /sizes="32px"/);
    assert.match(html, /\/_next\/image\?/);
    assert.ok(html.includes(`${slug}-v1.png`));
    assert.ok(readFileSync(new URL(`../public/brand/navigation/${slug}-v1.png`, import.meta.url)).length > 0);
  });
}

test('menu compacto conserva oito destinos e utiliza as mesmas artes', () => {
  pathname = '/clientes';
  const tree = TopNav();
  const items = find(tree, Item).filter((item) => item.props.children !== 'Sair');
  assert.equal(items.length, 8);
  assert.equal(items.filter((item) => item.props['aria-current'] === 'page').length, 1);
  calls.length = 0;
  for (const [index, item] of items.entries()) {
    item.props.onClick();
    const html = renderToStaticMarkup(item);
    assert.ok(html.includes(destinations[index][2] + '-v1.png'));
  }
  assert.deepEqual(calls, destinations.map(([href]) => href));
});

test('reaproveita exatamente os quatro arquivos do Company Web', () => {
  for (const slug of ['pedidos', 'clientes', 'financeiro', 'relatorios']) {
    const admin = readFileSync(new URL(`../public/brand/navigation/${slug}-v1.png`, import.meta.url));
    const company = readFileSync(new URL(`../../company-web/public/brand/navigation/${slug}-v1.png`, import.meta.url));
    assert.deepEqual(admin, company);
  }
});

test('preserva ocultar valores e logout sem adicionar ações operacionais', () => {
  const tree = TopNav();
  const [money] = find(tree, 'button');
  assert.equal(money.props['aria-pressed'], false);
  calls.length = 0;
  money.props.onClick();
  assert.deepEqual(calls, ['toggle-money']);
  const logout = find(tree, Item).find((item) => item.props.children === 'Sair');
  calls.length = 0;
  logout.props.onClick();
  assert.deepEqual(calls, ['clear-token', 'clear-cache', '/login']);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Chamar entregador/);
});
