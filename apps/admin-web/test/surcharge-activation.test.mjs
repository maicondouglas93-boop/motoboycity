import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = readFileSync(
  new URL('../src/components/settings/surcharge-activation-controls.tsx', import.meta.url),
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
const { SurchargeActivationControls } = componentModule.exports;
const surcharge = {
  id: 'rate-1',
  active: true,
  manuallyActive: false,
  automaticRainEnabled: false,
  schedules: [],
  rainAutomation: { status: 'RAINING' },
};
const props = (extra = {}) => ({
  surcharge,
  pending: false,
  onModeChange: () => {},
  onManualChange: () => {},
  ...extra,
});
const render = (extra) =>
  renderToStaticMarkup(createElement(SurchargeActivationControls, props(extra)));
function buttons(node) {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!node || typeof node !== 'object') return [];
  return node.type === 'button' ? [node] : buttons(node.props?.children);
}

test('Manual e Automática ficam separados e somente um é selecionado', () => {
  const html = render();
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /Ligar manual/);
  assert.match(html, /O clima não interfere/);
  const automatic = render({ surcharge: { ...surcharge, automaticRainEnabled: true } });
  assert.equal((automatic.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(automatic, /Só o clima de Lajinha ativa/);
  assert.doesNotMatch(automatic, /Ligar manual|Desligar manual/);
});

test('cliques enviam o modo pretendido sem antecipar confirmação na tela', () => {
  const modes = [];
  const manual = [];
  const tree = SurchargeActivationControls(
    props({ onModeChange: (mode) => modes.push(mode), onManualChange: (on) => manual.push(on) }),
  );
  const [manualMode, automaticMode, manualToggle] = buttons(tree);
  manualMode.props.onClick();
  assert.deepEqual(modes, []);
  automaticMode.props.onClick();
  assert.deepEqual(modes, [true]);
  manualToggle.props.onClick();
  assert.deepEqual(manual, [true]);
  assert.equal(manualMode.props['aria-pressed'], true);

  const automaticTree = SurchargeActivationControls(
    props({
      surcharge: { ...surcharge, automaticRainEnabled: true },
      onModeChange: (mode) => modes.push(mode),
    }),
  );
  buttons(automaticTree)[0].props.onClick();
  assert.deepEqual(modes, [true, false]);
});

test('desativada não mostra interruptor que possa cobrar; salvamento bloqueia cliques', () => {
  const html = render({ surcharge: { ...surcharge, active: false } });
  assert.match(html, /nenhum modo pode cobrar/);
  assert.doesNotMatch(html, /Ligar manual/);
  assert.match(render({ pending: true }), /<fieldset[^>]*disabled/);
});

test('sem vínculo no servidor, automático fica indisponível e manual continua', () => {
  for (const rainAutomation of [null, { status: 'DISABLED' }, { status: 'NOT_CONFIGURED' }]) {
    const tree = SurchargeActivationControls(
      props({ surcharge: { ...surcharge, rainAutomation } }),
    );
    assert.equal(buttons(tree)[1].props.disabled, true);
    assert.match(
      render({ surcharge: { ...surcharge, rainAutomation } }),
      /vincule o ID desta taxa/,
    );
  }
});

test('horários existentes não são escondidos como se Manual dependesse só do botão', () => {
  assert.match(
    render({ surcharge: { ...surcharge, schedules: [{}] } }),
    /Existem horários cadastrados/,
  );
  assert.match(
    render({ surcharge: { ...surcharge, automaticRainEnabled: true, schedules: [{}] } }),
    /horários ficam sem efeito/,
  );
});
