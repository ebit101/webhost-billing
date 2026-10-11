-- Test-only fixed grammar, not authority. __probe__ is an ownership-checked identifier.
-- No arbitrary recursive serializer: recursive calls follow the fixed tuple grammar.
CREATE FUNCTION __probe__.atom(v pg_catalog.jsonb, kind pg_catalog.text)
RETURNS pg_catalog.text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE x text; ok boolean := false; y integer; m integer; d integer; days integer;
BEGIN
  IF kind = 'null' AND v = 'null'::pg_catalog.jsonb THEN RETURN 'null'; END IF;
  IF kind = 'bool' AND pg_catalog.jsonb_typeof(v) = 'boolean' THEN
    RETURN CASE WHEN v = 'true'::pg_catalog.jsonb THEN 'true' ELSE 'false' END;
  END IF;
  IF kind = 'exp' AND pg_catalog.jsonb_typeof(v) = 'number' THEN
    x := v #>> '{}';
    IF x IN ('0','1','2','3','4') THEN RETURN x; END IF;
    RETURN NULL;
  END IF;
  IF pg_catalog.jsonb_typeof(v) IS DISTINCT FROM 'string' THEN RETURN NULL; END IF;
  x := v #>> '{}';
  CASE kind
  WHEN 'uuid', 'key' THEN
    ok := pg_catalog.length(x) = 36 AND (
      x IN ('00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff') OR
      (kind = 'uuid' AND x COLLATE "C" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') OR
      (kind = 'key' AND x COLLATE "C" ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'));
  WHEN 'version' THEN
    ok := pg_catalog.length(x) BETWEEN 1 AND 64 AND x COLLATE "C" ~ '^[A-Za-z0-9]' AND x COLLATE "C" !~ '[^A-Za-z0-9._:-]';
  WHEN 'code' THEN ok := pg_catalog.length(x) = 3 AND x COLLATE "C" !~ '[^A-Z]';
  WHEN 'counter', 'positive' THEN
    -- Grammar/length/lexical maximum precede every later bounded integer cast.
    ok := pg_catalog.length(x) BETWEEN 1 AND 19 AND x COLLATE "C" !~ '[^0-9]' AND
      (x COLLATE "C" ~ '^[1-9]' OR (kind = 'counter' AND x = '0')) AND
      (pg_catalog.length(x) < 19 OR x COLLATE "C" <= '9223372036854775807' COLLATE "C");
  WHEN 'provenance' THEN
    ok := pg_catalog.length(x) BETWEEN 1 AND 256 AND x COLLATE "C" !~ '[^ -~]' AND
      pg_catalog.left(x,1) <> ' ' AND pg_catalog.right(x,1) <> ' ';
  WHEN 'status' THEN ok := x IN ('current','historical');
  WHEN 'action' THEN ok := x IN ('initialize','adopt','replace');
  WHEN 'digest' THEN ok := pg_catalog.length(x) = 64 AND x COLLATE "C" !~ '[^a-f0-9]';
  WHEN 'utc' THEN
    -- Proleptic Gregorian validation, including year 0000. No PostgreSQL date cast.
    IF pg_catalog.length(x) <> 24 OR x COLLATE "C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RETURN NULL; END IF;
    y := pg_catalog.substr(x,1,4)::integer; m := pg_catalog.substr(x,6,2)::integer; d := pg_catalog.substr(x,9,2)::integer;
    IF m NOT BETWEEN 1 AND 12 THEN RETURN NULL; END IF;
    days := CASE WHEN m = 2 THEN CASE WHEN y % 4 = 0 AND (y % 100 <> 0 OR y % 400 = 0) THEN 29 ELSE 28 END
      WHEN m IN (4,6,9,11) THEN 30 ELSE 31 END;
    ok := d BETWEEN 1 AND days AND pg_catalog.substr(x,12,2)::integer <= 23 AND
      pg_catalog.substr(x,15,2)::integer <= 59 AND pg_catalog.substr(x,18,2)::integer <= 59;
  ELSE RETURN NULL;
  END CASE;
  IF NOT ok THEN RETURN NULL; END IF;
  -- ECMAScript minimal quoting for the validated printable ASCII domain.
  RETURN '"' || pg_catalog.replace(pg_catalog.replace(x,pg_catalog.chr(92),pg_catalog.chr(92)||pg_catalog.chr(92)),'"',pg_catalog.chr(92)||'"') || '"';
END $fn$;

CREATE FUNCTION __probe__.piece(kind pg_catalog.text, v pg_catalog.jsonb)
RETURNS pg_catalog.text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE n integer; i integer; j integer; fields text[]; kinds text[]; x jsonb; y jsonb;
  p jsonb; caps jsonb; units jsonb; ref jsonb; found boolean; out_text text;
  parts text[] := ARRAY[]::text[]; seen text[] := ARRAY[]::text[]; key text; limit_bytes integer := 65536;
BEGIN
  IF pg_catalog.jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  n := pg_catalog.jsonb_array_length(v);
  CASE kind
  WHEN 'ref' THEN kinds := ARRAY['code','version'];
  WHEN 'identity' THEN kinds := ARRAY['uuid','uuid'];
  WHEN 'cap' THEN kinds := ARRAY['code','version','bool','bool','bool'];
  WHEN 'unit' THEN kinds := ARRAY['code','version','exp','provenance','status'];
  WHEN 'S' THEN
    IF n <> 9 OR v->0 <> '"currency-selection-request-v1"'::jsonb THEN RETURN NULL; END IF;
    kinds := ARRAY['tag','identity','action','uuid','uuid','key','null','counter','version']; limit_bytes := 1024;
    IF v->>2 = 'replace' THEN
      kinds[7] := 'version';
      IF v->>7 = '0' OR v->6 = v->8 THEN RETURN NULL; END IF;
    ELSIF v->>2 IN ('initialize','adopt') THEN
      IF v->6 <> 'null'::jsonb OR v->7 <> '"0"'::jsonb THEN RETURN NULL; END IF;
    ELSE RETURN NULL; END IF;
  WHEN 'C' THEN
    IF n <> 8 THEN RETURN NULL; END IF; limit_bytes := 512;
    IF v->0 = '"absent"'::jsonb THEN kinds := ARRAY['absent','null','null','null','null','null','null','null'];
    ELSIF v->0 = '"unassessed"'::jsonb THEN
      IF v->1 <> '"0"'::jsonb THEN RETURN NULL; END IF;
      kinds := ARRAY['unassessed','counter','null','null','null','null','null','utc'];
    ELSIF v->0 = '"selected"'::jsonb THEN kinds := ARRAY['selected','positive','version','bool','code','version','exp','utc'];
    ELSE RETURN NULL; END IF;
  WHEN 'H' THEN
    IF n <> 10 THEN RETURN NULL; END IF; limit_bytes := 1024;
    kinds := ARRAY['uuid','uuid','uuid','uuid','uuid','positive','uuid','positive','totp','null'];
    IF v->8 = '"recovery"'::jsonb THEN kinds[9] := 'recovery'; kinds[10] := 'uuid';
    ELSIF v->8 <> '"totp"'::jsonb THEN RETURN NULL; END IF;
  WHEN 'E' THEN
    IF n <> 4 THEN RETURN NULL; END IF; limit_bytes := 224;
    IF NOT ((v->>0 = 'history' AND v->>2 = 'currency-history-assessment-v1') OR
      (v->>0 = 'compatibility' AND v->>2 = 'currency-compatibility-v1') OR
      (v->>0 = 'adoption' AND v->>2 = 'currency-adoption-v1')) THEN RETURN NULL; END IF;
    kinds := ARRAY['kind','uuid','registered','digest'];
  WHEN 'Context' THEN
    IF n <> 2 OR pg_catalog.jsonb_typeof(v->0) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
    p := v->0;
    IF pg_catalog.jsonb_array_length(p) <> 5 OR pg_catalog.jsonb_typeof(p->4) IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_typeof(v->1) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
    caps := p->4; units := v->1;
    IF pg_catalog.jsonb_array_length(caps) NOT BETWEEN 1 AND 32 OR pg_catalog.jsonb_array_length(units) NOT BETWEEN 1 AND 32 THEN RETURN NULL; END IF;
    IF pg_catalog.jsonb_array_length(caps) <> pg_catalog.jsonb_array_length(units) THEN RETURN NULL; END IF;
    fields := ARRAY[__probe__.atom(p->0,'version'),__probe__.piece('ref',p->1),__probe__.piece('ref',p->2),
      CASE WHEN p->3 = 'null'::jsonb THEN 'null' ELSE __probe__.piece('ref',p->3) END];
    IF pg_catalog.array_position(fields,NULL) IS NOT NULL THEN RETURN NULL; END IF;
    IF p->3 <> 'null'::jsonb AND p->3->0 = p->2->0 THEN RETURN NULL; END IF;
    FOR i IN 0..pg_catalog.jsonb_array_length(caps)-1 LOOP
      x := caps->i; out_text := __probe__.piece('cap',x);
      IF out_text IS NULL OR (x->>0) = ANY(seen) THEN RETURN NULL; END IF;
      seen := pg_catalog.array_append(seen,x->>0); parts := pg_catalog.array_append(parts,out_text);
    END LOOP;
    SELECT pg_catalog.array_agg(z ORDER BY z COLLATE "C") INTO parts FROM pg_catalog.unnest(parts) z;
    fields := pg_catalog.array_append(fields,'['||pg_catalog.array_to_string(parts,',')||']');
    parts := ARRAY[]::text[]; seen := ARRAY[]::text[];
    FOR i IN 0..pg_catalog.jsonb_array_length(units)-1 LOOP
      x := units->i; out_text := __probe__.piece('unit',x); key := (x->>0)||':'||(x->>1);
      IF out_text IS NULL OR key = ANY(seen) THEN RETURN NULL; END IF;
      seen := pg_catalog.array_append(seen,key); parts := pg_catalog.array_append(parts,out_text);
      found := false;
      FOR j IN 0..pg_catalog.jsonb_array_length(caps)-1 LOOP
        y := caps->j;
        IF x->0 = y->0 AND x->1 = y->1 THEN
          found := true;
          IF x->>4 = 'historical' AND (y->2 = 'true'::jsonb OR y->3 = 'true'::jsonb) THEN RETURN NULL; END IF;
        END IF;
      END LOOP;
      IF NOT found THEN RETURN NULL; END IF;
    END LOOP;
    FOR i IN 1..3 LOOP
      ref := p->i; IF ref = 'null'::jsonb THEN CONTINUE; END IF; found := false;
      FOR j IN 0..pg_catalog.jsonb_array_length(caps)-1 LOOP
        x := caps->j;
        IF x->0 = ref->0 AND x->1 = ref->1 THEN
          found := true; IF i <> 1 AND x->2 <> 'true'::jsonb THEN RETURN NULL; END IF;
        END IF;
      END LOOP;
      IF NOT found THEN RETURN NULL; END IF;
    END LOOP;
    SELECT pg_catalog.array_agg(z ORDER BY z COLLATE "C") INTO parts FROM pg_catalog.unnest(parts) z;
    out_text := '[['||pg_catalog.array_to_string(fields,',')||'],['||pg_catalog.array_to_string(parts,',')||']]';
    IF pg_catalog.octet_length(out_text) > 24576 THEN RETURN NULL; END IF;
    RETURN out_text;
  ELSE RETURN NULL;
  END CASE;
  IF n <> pg_catalog.cardinality(kinds) THEN RETURN NULL; END IF;
  FOR i IN 0..n-1 LOOP
    IF kinds[i+1] IN ('identity') THEN out_text := __probe__.piece(kinds[i+1],v->i);
    ELSIF kinds[i+1] IN ('tag','absent','unassessed','selected','totp','recovery','kind','registered') THEN
      -- These literals were matched exactly above; never quote unchecked values.
      out_text := CASE kinds[i+1]
        WHEN 'tag' THEN '"currency-selection-request-v1"' WHEN 'absent' THEN '"absent"'
        WHEN 'unassessed' THEN '"unassessed"' WHEN 'selected' THEN '"selected"'
        WHEN 'totp' THEN '"totp"' WHEN 'recovery' THEN '"recovery"'
        WHEN 'kind' THEN CASE v->>0 WHEN 'history' THEN '"history"' WHEN 'compatibility' THEN '"compatibility"' WHEN 'adoption' THEN '"adoption"' END
        WHEN 'registered' THEN CASE v->>0 WHEN 'history' THEN '"currency-history-assessment-v1"' WHEN 'compatibility' THEN '"currency-compatibility-v1"' WHEN 'adoption' THEN '"currency-adoption-v1"' END END;
    ELSE out_text := __probe__.atom(v->i,kinds[i+1]); END IF;
    IF out_text IS NULL THEN RETURN NULL; END IF;
    parts := pg_catalog.array_append(parts,out_text);
  END LOOP;
  out_text := '['||pg_catalog.array_to_string(parts,',')||']';
  IF pg_catalog.octet_length(out_text) > limit_bytes THEN RETURN NULL; END IF;
  RETURN out_text;
END $fn$;

CREATE FUNCTION __probe__.verify(s_text pg_catalog.text, a_text pg_catalog.text)
RETURNS pg_catalog.jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE s jsonb; a jsonb; c jsonb; h jsonb; roots jsonb; proposed jsonb; prior jsonb; anchor jsonb;
  x jsonb; y jsonb; prior_base jsonb; proposed_base jsonb; all_units jsonb;
  st text; at_text text; sd text; ct text; pt text; rt text := 'null'; ut text := 'null'; ht text;
  et text; es text[] := ARRAY[]::text[]; seen text[] := ARRAY[]::text[]; kinds text[] := ARRAY[]::text[];
  i integer; j integer; key text; scan bytea; ch integer; depth integer; quoted boolean; escaped boolean;
  invalid constant jsonb := '{"success":false,"error":"Invalid currency canonical binding"}'::jsonb;
BEGIN
  -- Bound both primitive SQL texts before JSON conversion/allocation.
  IF s_text IS NULL OR a_text IS NULL OR pg_catalog.octet_length(s_text) > 1024 OR pg_catalog.octet_length(a_text) > 65536 THEN RETURN invalid; END IF;
  -- Bounded lexical nesting guard before PostgreSQL's parser, not a JSON codec.
  -- Prevent parser stack exhaustion for malformed/deep text; braces inside quoted
  -- printable provenance are data. JSON conversion still validates actual syntax.
  FOR j IN 1..2 LOOP
    scan := pg_catalog.convert_to(CASE WHEN j = 1 THEN s_text ELSE a_text END,'UTF8');
    depth := 0; quoted := false; escaped := false;
    FOR i IN 0..pg_catalog.octet_length(scan)-1 LOOP
      -- Constant-time byte indexing avoids quadratic UTF-8 substr scans.
      ch := pg_catalog.get_byte(scan,i);
      IF quoted THEN
        IF escaped THEN escaped := false;
        ELSIF ch = 92 THEN escaped := true;
        ELSIF ch = 34 THEN quoted := false; END IF;
      ELSIF ch = 34 THEN quoted := true;
      ELSIF ch IN (123,125) THEN RETURN invalid;
      ELSIF ch = 91 THEN
        depth := depth + 1;
        IF depth > (CASE WHEN j = 1 THEN 2 ELSE 5 END) THEN RETURN invalid; END IF;
      ELSIF ch = 93 THEN depth := depth - 1; IF depth < 0 THEN RETURN invalid; END IF;
      END IF;
    END LOOP;
    IF quoted OR depth <> 0 THEN RETURN invalid; END IF;
  END LOOP;
  s := s_text::pg_catalog.jsonb; a := a_text::pg_catalog.jsonb;
  st := __probe__.piece('S',s);
  IF st IS NULL OR pg_catalog.convert_to(st,'UTF8') <> pg_catalog.convert_to(s_text,'UTF8') THEN RETURN invalid; END IF;
  sd := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(st,'UTF8')),'hex');
  IF pg_catalog.jsonb_typeof(a) IS DISTINCT FROM 'array' THEN RETURN invalid; END IF;
  IF pg_catalog.jsonb_array_length(a) <> 8 OR a->0 <> '"currency-selection-assessment-v1"'::jsonb
    OR __probe__.atom(a->1,'digest') IS NULL OR a->>1 <> sd THEN RETURN invalid; END IF;
  c := a->2; ct := __probe__.piece('C',c); pt := __probe__.piece('Context',a->3);
  IF ct IS NULL OR pt IS NULL THEN RETURN invalid; END IF;
  proposed := pt::jsonb;
  IF proposed->0->0 <> s->8 THEN RETURN invalid; END IF;
  IF c->>0 = 'selected' THEN
    IF s->>2 <> 'replace' OR c->1 <> s->7 OR c->2 <> s->6 THEN RETURN invalid; END IF;
    rt := __probe__.piece('Context',a->4); ut := __probe__.piece('unit',a->5);
    IF rt IS NULL OR ut IS NULL THEN RETURN invalid; END IF;
    prior := rt::jsonb; anchor := ut::jsonb;
    IF prior->0->0 <> c->2 OR anchor->0 <> c->4 OR anchor->1 <> c->5 OR anchor->2 <> c->6 THEN RETURN invalid; END IF;
    FOR i IN 0..pg_catalog.jsonb_array_length(prior->1)-1 LOOP
      x := prior->1->i; IF x->0 = prior->0->1->0 AND x->1 = prior->0->1->1 THEN prior_base := x; END IF;
    END LOOP;
    FOR i IN 0..pg_catalog.jsonb_array_length(proposed->1)-1 LOOP
      x := proposed->1->i; IF x->0 = proposed->0->1->0 AND x->1 = proposed->0->1->1 THEN proposed_base := x; END IF;
    END LOOP;
    IF c->3 = 'false'::jsonb THEN
      IF prior_base <> anchor THEN RETURN invalid; END IF;
    ELSIF prior_base->0 <> anchor->0 OR prior_base->2 <> anchor->2 OR proposed_base->0 <> anchor->0 OR proposed_base->2 <> anchor->2 THEN RETURN invalid; END IF;
  ELSE
    IF s->>2 NOT IN ('initialize','adopt') OR s->6 <> 'null'::jsonb OR s->>7 <> '0' OR a->4 <> 'null'::jsonb OR a->5 <> 'null'::jsonb THEN RETURN invalid; END IF;
  END IF;
  all_units := proposed->1;
  IF prior IS NOT NULL THEN all_units := all_units || (prior->1) || pg_catalog.jsonb_build_array(anchor); END IF;
  FOR i IN 0..pg_catalog.jsonb_array_length(all_units)-1 LOOP
    FOR j IN 0..i-1 LOOP
      x := all_units->i; y := all_units->j;
      IF x->0 = y->0 AND x->1 = y->1 AND x <> y THEN RETURN invalid; END IF;
    END LOOP;
  END LOOP;
  h := a->6; ht := __probe__.piece('H',h);
  IF ht IS NULL OR h->1 <> s->1->1 OR h->2 <> s->3 OR h->4 <> s->4 THEN RETURN invalid; END IF;
  roots := a->7;
  IF pg_catalog.jsonb_typeof(roots) IS DISTINCT FROM 'array' THEN RETURN invalid; END IF;
  IF pg_catalog.jsonb_array_length(roots) NOT BETWEEN 1 AND 32 THEN RETURN invalid; END IF;
  FOR i IN 0..pg_catalog.jsonb_array_length(roots)-1 LOOP
    x := roots->i; et := __probe__.piece('E',x); key := (x->>0)||':'||(x->>1);
    IF et IS NULL OR key = ANY(seen) THEN RETURN invalid; END IF;
    seen := pg_catalog.array_append(seen,key); kinds := pg_catalog.array_append(kinds,x->>0); es := pg_catalog.array_append(es,et);
  END LOOP;
  IF NOT ('history' = ANY(kinds) AND 'compatibility' = ANY(kinds)) OR (s->>2 = 'adopt' AND NOT 'adoption' = ANY(kinds)) THEN RETURN invalid; END IF;
  -- Version is fixed per kind; bytewise full-entry ordering equals kind/version/id ordering.
  SELECT pg_catalog.array_agg(z ORDER BY z COLLATE "C") INTO es FROM pg_catalog.unnest(es) z;
  at_text := '["currency-selection-assessment-v1","'||sd||'",'||ct||','||pt||','||rt||','||ut||','||ht||',['||pg_catalog.array_to_string(es,',')||']]';
  IF pg_catalog.octet_length(at_text) > 65536 OR pg_catalog.convert_to(at_text,'UTF8') <> pg_catalog.convert_to(a_text,'UTF8') THEN RETURN invalid; END IF;
  RETURN pg_catalog.jsonb_build_object('success',true,'stableCanonicalText',st,'canonicalText',at_text,'stableIntentDigest',sd,
    'assessmentDigest',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(at_text,'UTF8')),'hex'));
EXCEPTION
  -- Syntax/representation errors only. Cancellation, deadlines and transport failures escape.
  WHEN SQLSTATE '22P02' OR SQLSTATE '22003' OR SQLSTATE '22P05' OR SQLSTATE '22021' THEN RETURN invalid;
END $fn$;
