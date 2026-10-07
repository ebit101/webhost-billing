/**
 * Unused coordination-only prototype. The mandatory fictional test harness is
 * its only installer. This is not policy validation or a deployment procedure.
 * Caller deadlines must be established BEFORE the initiating DML statement.
 * Waiting here cannot refresh that statement's snapshot or undo earlier locks.
 * Settings are verified, not PostgreSQL's internal timer state. In particular,
 * lowering a positive transaction_timeout does not rearm an already active timer;
 * trusted callers must establish its initial budget (or an independent deadline).
 */
export function renderCurrencyCoordinationGuardPrototype(
  input: unknown,
): string {
  let schema: string;
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input))
      throw new Error();
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null) throw new Error();
    const keys = Reflect.ownKeys(input);
    if (keys.length !== 1 || keys[0] !== 'schema') throw new Error();
    const candidate: unknown = Reflect.get(input, 'schema');
    if (
      typeof candidate !== 'string' ||
      !/^[a-z_][a-z0-9_]{0,62}$/.test(candidate) ||
      candidate.startsWith('pg_') ||
      candidate === 'information_schema'
    )
      throw new Error();
    schema = candidate;
  } catch {
    throw new Error('Invalid currency coordination guard input.');
  }
  const tables = [
    'product_prices',
    'orders',
    'order_items',
    'services',
    'invoices',
    'invoice_items',
    'payments',
    'settings',
    'payment_events',
  ];
  const qualifiedFunction = `"${schema}"."__currency_coordination_guard"`;
  return `CREATE FUNCTION ${qualifiedFunction}() RETURNS pg_catalog.trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = pg_catalog
AS $currency_guard$
BEGIN
  IF TG_TABLE_SCHEMA <> '${schema}' OR TG_TABLE_NAME NOT IN (${tables.map((t) => `'${t}'`).join(', ')})
    OR TG_LEVEL <> 'STATEMENT' OR TG_WHEN <> 'BEFORE' OR TG_NARGS <> 0
    OR NOT ((TG_OP IN ('INSERT','UPDATE','DELETE') AND TG_NAME = '__currency_coordination_dml')
      OR (TG_OP = 'TRUNCATE' AND TG_NAME = '__currency_coordination_truncate'))
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_trigger t ON t.tgrelid = c.oid
      WHERE c.oid = TG_RELID AND c.relname = TG_TABLE_NAME AND n.nspname = TG_TABLE_SCHEMA
        AND c.relkind = 'r' AND NOT c.relispartition
        AND pg_catalog.has_schema_privilege(n.oid, 'USAGE')
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid = c.oid OR i.inhparent = c.oid)
        AND t.tgname = TG_NAME AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgnargs = 0 AND t.tgqual IS NULL
        AND t.tgfoid = '${qualifiedFunction}()'::pg_catalog.regprocedure
        AND t.tgtype = CASE WHEN TG_OP = 'TRUNCATE' THEN 34 ELSE 30 END
    ) THEN
    RAISE EXCEPTION 'Currency coordination guard context denied.';
  END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    OR pg_catalog.current_setting('transaction_read_only') <> 'off'
    OR (
      SELECT pg_catalog.count(*) = 3 AND pg_catalog.bool_and(s.unit = 'ms' AND s.setting::pg_catalog.int8 > 0
        AND s.setting::pg_catalog.int8 <= CASE s.name
          WHEN 'lock_timeout' THEN 500 WHEN 'statement_timeout' THEN 2000 ELSE 10000 END)
      FROM pg_catalog.pg_settings s
      WHERE s.name IN ('lock_timeout','statement_timeout','transaction_timeout')
    ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Currency coordination guard mode or deadline denied.';
  END IF;
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Currency coordination guard truncation denied.';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database()),
    pg_catalog.hashtext(TG_TABLE_SCHEMA));
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_locks l WHERE l.pid = pg_catalog.pg_backend_pid()
      AND l.locktype = 'advisory' AND l.granted AND l.mode = 'ExclusiveLock'
      AND l.database = (SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())
      AND l.classid = pg_catalog.hashtext('webhost-billing.currency-coordination.v1:' || pg_catalog.current_database())::pg_catalog.oid
      AND l.objid = pg_catalog.hashtext(TG_TABLE_SCHEMA)::pg_catalog.oid AND l.objsubid = 2
  ) THEN
    RAISE EXCEPTION 'Currency coordination guard lock denied.';
  END IF;
  RETURN NULL;
EXCEPTION
  WHEN query_canceled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Currency coordination guard failed.';
  WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Currency coordination guard failed.';
END;
$currency_guard$;
${tables
  .map(
    (
      table,
    ) => `CREATE TRIGGER "__currency_coordination_dml" BEFORE INSERT OR UPDATE OR DELETE ON "${schema}"."${table}"
FOR EACH STATEMENT EXECUTE FUNCTION ${qualifiedFunction}();
CREATE TRIGGER "__currency_coordination_truncate" BEFORE TRUNCATE ON "${schema}"."${table}"
FOR EACH STATEMENT EXECUTE FUNCTION ${qualifiedFunction}();`,
  )
  .join('\n')}
`;
}
