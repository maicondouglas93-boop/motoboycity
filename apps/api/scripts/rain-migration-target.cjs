const assert = require('node:assert/strict');

const TEST_DATABASE = 'rain_migration_check';

/** Só aceita a porta publicada do container efêmero criado pelo próprio teste. */
function isolatedSchema(source, dbUrl, publishedPort) {
  const url = new URL(dbUrl);
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, String(publishedPort));
  assert.equal(url.pathname, `/${TEST_DATABASE}`);
  assert.equal(url.username, 'postgres');
  assert.equal(url.password, '');
  assert.equal(url.search, '?schema=public');
  assert.equal(url.hash, '');
  assert.match(String(publishedPort), /^\d+$/);
  assert(Number(publishedPort) > 1024 && Number(publishedPort) <= 65535);

  const datasourcePattern = /^datasource db \{[^}]*\}/m;
  assert.match(source, datasourcePattern);
  assert.equal((source.match(/^datasource /gm) ?? []).length, 1);
  // Substitui o bloco inteiro: directUrl/shadowDatabaseUrl antigos não sobrevivem.
  const block = `datasource db {\n  provider = "postgresql"\n  url = "${dbUrl}"\n  directUrl = "${dbUrl}"\n}`;
  return source.replace(datasourcePattern, block);
}

module.exports = { isolatedSchema, TEST_DATABASE };
