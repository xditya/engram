import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'model');
const sql = readFileSync(join(dir, 'schema.sql'), 'utf8').replace(/\r\n/g, '\n');
writeFileSync(
  join(dir, 'schema.ts'),
  `// Generated from schema.sql by \`pnpm gen:schema\`. Do not edit.\nexport const SCHEMA_SQL = ${JSON.stringify(sql)};\n`,
);
