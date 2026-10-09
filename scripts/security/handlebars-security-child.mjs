import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolveHandlebarsConsumers } from './tooling-dependencies.mjs';

// Only harmless in-memory canaries. The parent strips credentials and bounds
// memory, stack, wall time and output; no probe performs external operations.
const canary = '(globalThis.__handlebarsCanary = true)';
const name = process.argv[2];

function rejected(operation, expected) {
  assert.throws(operation, (error) => {
    return error instanceof Error && expected.test(error.message);
  });
  assert.equal(globalThis.__handlebarsCanary, false);
}

function precompiled(handlebars, source, options = {}) {
  const result = handlebars.precompile(source, options);
  return typeof result === 'string' ? result : result.code;
}

function renderPrecompiled(handlebars, code, input = {}, options = {}) {
  // Only code returned by the installed compiler from known positive templates
  // reaches this VM; rejected AST payloads never reach evaluation.
  const spec = runInNewContext(`(${code})`, Object.create(null), {
    timeout: 1_000,
  });
  return handlebars.template(spec)(input, options);
}

function astChecks(handlebars) {
  const cases = [
    [
      '{{#if ok}}safe{{/if}}',
      (ast) => {
        ast.body[0].program.blockParams = { length: canary };
      },
      /Invalid AST: Program blockParams must be an array/,
    ],
    [
      '{{#if ok}}safe{{/if}}',
      (ast) => {
        ast.body[0].program.blockParams = [1];
      },
      /Invalid AST: Program blockParams must only contain strings/,
    ],
    [
      '{{lookup this 1}}',
      (ast) => {
        ast.body[0].params[1].value = canary;
      },
      /Invalid AST: NumberLiteral value must be a number/,
    ],
    [
      '{{lookup this 1}}',
      (ast) => {
        ast.body[0].params[1].value = [canary];
      },
      /Invalid AST: NumberLiteral value must be a number/,
    ],
    [
      '{{#if true}}safe{{/if}}',
      (ast) => {
        ast.body[0].params[0].value = canary;
      },
      /Invalid AST: BooleanLiteral value must be a boolean/,
    ],
    [
      '{{lookup this "safe"}}',
      (ast) => {
        ast.body[0].params[1].value = { value: canary };
      },
      /Invalid AST: StringLiteral value must be a string/,
    ],
    [
      '{{lookup this "safe"}}',
      (ast) => {
        ast.body[0].params[0].depth = canary;
      },
      /Invalid AST: PathExpression depth must be a non-negative integer/,
    ],
    [
      '{{safe}}',
      (ast) => {
        ast.body[0].path.parts = [1];
      },
      /Invalid AST: PathExpression parts must only contain strings/,
    ],
  ];
  for (const [source, mutate, expected] of cases) {
    for (const options of [{}, { stringParams: true }]) {
      for (const mode of ['compile', 'precompile']) {
        const ast = handlebars.parse(source);
        mutate(ast);
        rejected(() => {
          if (mode === 'compile')
            handlebars.compile(ast, options)({ ok: true });
          else handlebars.precompile(ast, options);
        }, expected);
      }
    }
  }
  for (const type of ['compile', 'opcode', 'constructor', '__proto__']) {
    const ast = handlebars.parse('{{lookup this "safe"}}');
    ast.body[0].params[1] = { type, loc: ast.loc };
    rejected(() => handlebars.compile(ast)({}), /Unknown type: /);
    rejected(() => handlebars.precompile(ast), /Unknown type: /);
  }
  const valid = handlebars.parse('{{#each items as |item|}}{{item}}{{/each}}');
  assert.equal(handlebars.compile(valid)({ items: ['a', 'b'] }), 'ab');
  assert.equal(
    renderPrecompiled(handlebars, precompiled(handlebars, valid), {
      items: ['a', 'b'],
    }),
    'ab',
  );
}

function constructorChecks(handlebars) {
  function harmlessConstructor() {
    globalThis.__handlebarsCanary = true;
    return 'unexpected';
  }
  const contexts = [
    Function.prototype,
    Object.prototype,
    harmlessConstructor.prototype,
  ];
  for (const context of contexts) {
    assert.ok(Object.hasOwn(context, 'constructor'));
    for (const source of [
      '{{constructor}}',
      '{{constructor.name}}',
      '{{lookup this "constructor"}}',
    ]) {
      for (const options of [
        {},
        {
          allowProtoMethodsByDefault: true,
          allowProtoPropertiesByDefault: true,
        },
      ]) {
        assert.equal(handlebars.compile(source)(context, options), '');
        assert.equal(
          renderPrecompiled(
            handlebars,
            precompiled(handlebars, source),
            context,
            options,
          ),
          '',
        );
        assert.equal(globalThis.__handlebarsCanary, false);
      }
    }
  }
  for (const source of [
    '{{constructor.name}}',
    '{{lookup (lookup this "constructor") "name"}}',
  ]) {
    assert.equal(handlebars.compile(source)({}), '');
    assert.equal(
      handlebars.compile(source)({}, { allowProtoMethodsByDefault: true }),
      '',
    );
  }
  // Legitimate own data must remain available: banning all constructor keys
  // would mask the repaired distinction between data and prototype backrefs.
  assert.equal(
    handlebars.compile('{{constructor.name}}')({
      constructor: { name: 'ordinary data' },
    }),
    'ordinary data',
  );
  assert.equal(
    handlebars.compile('{{constructor}}')({ constructor: 'ordinary data' }),
    'ordinary data',
  );
}

function inlineChecks(handlebars) {
  const boundary = '</ScRiPt ><SCRIPT><!--';
  const cases = [
    [boundary, {}, boundary],
    [
      '<div>ordinary markup</div><!- ->',
      {},
      '<div>ordinary markup</div><!- ->',
    ],
    [`{{{echo "${boundary}"}}}`, {}, boundary],
    [`{{[${boundary}]}}`, { [boundary]: 'property' }, 'property'],
    [`{{@root.[${boundary}]}}`, { [boundary]: 'data' }, 'data'],
    [`{{> [${boundary}]}}`, {}, 'partial'],
  ];
  handlebars.registerHelper('echo', (value) => value);
  handlebars.registerPartial(boundary, 'partial');
  for (const [source, input, expected] of cases) {
    for (const options of [{}, { compat: true }, { srcName: boundary }]) {
      const code = precompiled(handlebars, source, options);
      assert.doesNotMatch(code, /<(!--|\/?script)/i);
      assert.equal(renderPrecompiled(handlebars, code, input), expected);
      assert.equal(handlebars.compile(source)(input), expected);
    }
  }
  const code = precompiled(handlebars, boundary);
  assert.ok(code.includes('\\u003C/ScRiPt'));
  assert.ok(code.includes('\\u003CSCRIPT'));
  assert.ok(code.includes('\\u003C!--'));
}

function compatibilityChecks(handlebars) {
  handlebars.registerPartial('row', '{{name}}:{{amount}}');
  const source = '{{#each rows as |row|}}{{> row row}};{{else}}none{{/each}}';
  const input = { rows: [{ name: 'hosting', amount: '120000' }] };
  assert.equal(handlebars.compile(source)(input), 'hosting:120000;');
  assert.equal(
    renderPrecompiled(handlebars, precompiled(handlebars, source), input),
    'hosting:120000;',
  );
  assert.equal(handlebars.compile(source)({ rows: [] }), 'none');
  assert.equal(
    handlebars.compile('{{name}}')({ name: '<safe>' }),
    '&lt;safe&gt;',
  );
  assert.equal(
    handlebars.compile('{{#each items}}{{this}};{{/each}}')({
      items: new Map([
        ['one', 'a'],
        ['two', 'b'],
      ]),
    }),
    'one,a;two,b;',
  );
  assert.equal(
    handlebars.compile('{{#each items}}{{this}};{{/each}}')({
      items: new Set(['a', 'b']),
    }),
    'a;b;',
  );
  function* items() {
    yield 'a';
    yield 'b';
  }
  assert.equal(
    handlebars.compile('{{#each items}}{{this}};{{/each}}')({ items: items() }),
    'a;b;',
  );
}

try {
  const checks = {
    'handlebars-consumers': () => {},
    'handlebars-ast': astChecks,
    'handlebars-constructors': constructorChecks,
    'handlebars-inline': inlineChecks,
    'handlebars-compatibility': compatibilityChecks,
  };
  assert.ok(Object.hasOwn(checks, name));
  const consumers = resolveHandlebarsConsumers();
  assert.deepEqual(
    consumers.map(({ consumer }) => consumer),
    ['apps/api', 'apps/worker', 'packages/queue'],
  );
  for (const { handlebarsPath, version } of consumers) {
    assert.equal(version, '4.7.10');
    const handlebars = createRequire(import.meta.url)(handlebarsPath).create();
    assert.equal(handlebars.VERSION, '4.7.10');
    globalThis.__handlebarsCanary = false;
    checks[name](handlebars);
    assert.equal(globalThis.__handlebarsCanary, false);
  }
  process.stdout.write(`${name}: passed\n`);
} catch {
  // No template, generated JavaScript, context, stack or environment disclosure.
  process.stderr.write('Installed Handlebars regression failed\n');
  process.exitCode = 1;
} finally {
  delete globalThis.__handlebarsCanary;
}
