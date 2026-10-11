import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeIdentifier as ident } from 'pg';
import type {
  PrivilegeHarness,
  TestConnection,
} from './currency-privilege-harness';

export const paritySql = readFileSync(
  resolve(__dirname, 'currency-canonical-parity.sql'),
  'utf8',
);
export const signatures = [
  'atom(jsonb,text)',
  'piece(text,jsonb)',
  'verify(text,text)',
] as const;
export const invalidBinding = {
  success: false,
  error: 'Invalid currency canonical binding',
};

export async function installParity(
  h: PrivilegeHarness,
  admin: TestConnection,
) {
  await h.verifyOwnership();
  for (const name of [h.probe, h.roles.functions, h.roles.executor]) {
    if (!/^[a-z][a-z0-9_]{1,62}$/.test(name))
      throw new Error('Invalid test ownership');
  }
  const schema = ident(h.probe);
  const owner = ident(h.roles.functions);
  const executor = ident(h.roles.executor);
  // Atomic setup, explicit ACLs even for the creation owner. Never install in product.
  await admin.query(`BEGIN;
    CREATE SCHEMA ${schema};
    REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC;
    GRANT USAGE ON SCHEMA ${schema} TO ${owner},${executor};
    ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
    ${paritySql.replaceAll('__probe__', schema)}
    ${signatures.map((s) => `ALTER FUNCTION ${schema}.${s} OWNER TO ${owner}; REVOKE ALL ON FUNCTION ${schema}.${s} FROM PUBLIC; GRANT EXECUTE ON FUNCTION ${schema}.${s} TO ${executor};`).join('\n')}
    COMMIT;`);
}

export async function verifyBinding(
  client: TestConnection,
  probe: string,
  stable: string | null,
  assessment: string | null,
): Promise<unknown> {
  const result = await client.query(
    `SELECT ${ident(probe)}.verify($1::text,$2::text) AS result`,
    [stable, assessment],
  );
  return result.rows[0]?.result;
}
