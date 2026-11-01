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

const { ServiceStatusHeaderAction, ServiceClosedHomeNotice } = load(
  '../src/components/operations/service-status-home-control.tsx',
  {
    '@/components/ui/button': {
      Button: ({ children, disabled, onClick, className }) =>
        createElement('button', { disabled, onClick, className }, children),
    },
    '@/components/admin/confirm-action-dialog': { ConfirmActionDialog },
  },
);

function find(node, type) {
  if (Array.isArray(node)) return node.flatMap((child) => find(child, type));
  if (!node || typeof node !== 'object') return [];
  return node.type === type ? [node] : find(node.props?.children, type);
}

test('sem configuracoes carregadas nao renderiza botao falso nem banner', () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(ServiceStatusHeaderAction, {
        settings: null,
        pending: false,
        onToggle: async () => {},
      }),
    ),
    '',
  );
  assert.equal(
    renderToStaticMarkup(
      createElement(ServiceClosedHomeNotice, {
        settings: null,
        pending: false,
        onReopen: async () => {},
      }),
    ),
    '',
  );
});

test('quando aberto, exibe botao Finalizar atendimentos e esconde banner de encerramento', async () => {
  const toggled = [];
  const settings = { acceptingOrders: true, businessHoursEnabled: true };
  const html = renderToStaticMarkup(
    createElement(ServiceStatusHeaderAction, {
      settings,
      pending: false,
      onToggle: async (next) => toggled.push(next),
    }),
  );
  assert.match(html, /Finalizar atendimentos/);
  assert.equal(
    renderToStaticMarkup(
      createElement(ServiceClosedHomeNotice, {
        settings,
        pending: false,
        onReopen: async () => {},
      }),
    ),
    '',
  );

  const tree = ServiceStatusHeaderAction({
    settings,
    pending: false,
    onToggle: async (next) => toggled.push(next),
  });
  const [dialog] = find(tree, ConfirmActionDialog);
  assert.equal(dialog.props.variant, 'destructive');
  assert.match(dialog.props.consequence, /já estão em andamento continuam normalmente/);
  await dialog.props.onConfirm();
  assert.deepEqual(toggled, [false]);
});

test('quando finalizado, exibe Abrir atendimentos no topo e no banner com aviso sobre horario semanal', async () => {
  const toggled = [];
  const settings = { acceptingOrders: false, businessHoursEnabled: true };

  const headerHtml = renderToStaticMarkup(
    createElement(ServiceStatusHeaderAction, {
      settings,
      pending: true,
      onToggle: async (next) => toggled.push(next),
    }),
  );
  assert.match(headerHtml, /Abrir atendimentos/);
  assert.match(headerHtml, /<button[^>]*disabled/);

  const bannerHtml = renderToStaticMarkup(
    createElement(ServiceClosedHomeNotice, {
      settings,
      pending: false,
      onReopen: async () => toggled.push(true),
    }),
  );
  assert.match(bannerHtml, /Atendimentos finalizados/);
  assert.match(bannerHtml, /Nenhum novo pedido pode ser lançado/);
  assert.match(bannerHtml, /Abrir atendimentos/);

  const tree = ServiceStatusHeaderAction({
    settings,
    pending: false,
    onToggle: async (next) => toggled.push(next),
  });
  const [dialog] = find(tree, ConfirmActionDialog);
  assert.match(dialog.props.consequence, /horário semanal de funcionamento continua ativo/);
  await dialog.props.onConfirm();
  assert.deepEqual(toggled, [true]);
});
