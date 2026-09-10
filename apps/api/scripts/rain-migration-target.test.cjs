const assert = require('node:assert/strict');
const test = require('node:test');
const { isolatedSchema } = require('./rain-migration-target.cjs');

const source = `datasource db {
  provider = "postgresql"
  url = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
  shadowDatabaseUrl = "postgresql://old-target.example/old"
}
model Fixture { id String @id }
`;
const local = 'postgresql://postgres@127.0.0.1:54399/rain_migration_check?schema=public';

test('substitui todas as conexões do schema sem herdar ambiente ou shadow', () => {
  const schema = isolatedSchema(source, local, '54399');
  assert.equal(schema.split(local).length - 1, 2);
  assert.doesNotMatch(schema, /env\(|DIRECT_URL|shadowDatabaseUrl|old-target/);
  assert.match(schema, /model Fixture/);
});

test('recusa alvo remoto, banco de desenvolvimento, outra porta ou parâmetros extras', () => {
  for (const url of [
    local.replace('127.0.0.1', 'db.example.com'),
    local.replace('rain_migration_check', 'motoboycity_dev'),
    local.replace('54399', '5434'),
    `${local}&host=remote.example`,
    local.replace('postgres@', 'other@'),
  ])
    assert.throws(() => isolatedSchema(source, url, '54399'));
});

test('recusa schema sem datasource conhecida ou com mais de uma datasource', () => {
  assert.throws(() => isolatedSchema('model Fixture { id String @id }', local, '54399'));
  assert.throws(() =>
    isolatedSchema(`${source}\ndatasource other { provider = "postgresql" }`, local, '54399'),
  );
});
