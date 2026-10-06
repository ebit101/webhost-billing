import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  resolveToolingDependencies,
  repositoryRoot,
} from './tooling-dependencies.mjs';

const require = createRequire(import.meta.url);
const dependencies = resolveToolingDependencies();
assert.equal(dependencies.bracesVersion, '3.0.3');
assert.equal(dependencies.sprintfVersion, '1.0.3');
const braces = require(dependencies.bracesPath);
const { sprintf, vsprintf } = require(dependencies.sprintfPath);

function rejected(callback) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof SyntaxError);
    assert.match(error.message, /safe traversal limits/);
    assert.doesNotMatch(error.message, /call stack/);
    return true;
  });
}

function nestedAst(depth) {
  let node = { type: 'text', value: 'ok' };
  for (let i = 0; i < depth; i++) node = { type: 'root', nodes: [node] };
  return node;
}

const cases = {
  'brace-patterns': () => {
    // Under the upstream 10,000-character limit, including unbalanced/mixed input.
    for (const pattern of [
      '{'.repeat(2048) + 'x' + '}'.repeat(2048),
      '('.repeat(2048) + 'x' + ')'.repeat(2048),
      '{('.repeat(1024) + 'x' + ')}'.repeat(1024),
      '{'.repeat(2048),
      '('.repeat(2048),
    ]) {
      for (const method of ['parse', 'compile', 'expand', 'stringify']) {
        rejected(() => braces[method](pattern));
      }
      rejected(() => braces(pattern));
    }
    // Options cannot raise the nesting budget.
    rejected(() => braces.parse('{'.repeat(128), { maxDepth: Infinity }));
    for (const char of ['{', '(']) {
      const close = char === '{' ? '}' : ')';
      const boundary = char.repeat(127) + 'x' + close.repeat(127);
      assert.ok(braces.parse(boundary));
      assert.equal(braces.stringify(boundary), boundary);
      assert.equal(typeof braces.compile(boundary), 'string');
    }
    assert.deepEqual(braces.expand('{'.repeat(32) + 'x' + '}'.repeat(32)), [
      '{'.repeat(32) + 'x' + '}'.repeat(32),
    ]);
  },
  'brace-ast': () => {
    for (const method of ['compile', 'expand', 'stringify']) {
      rejected(() => braces[method](nestedAst(2048)));
      const cycle = { type: 'root', nodes: [] };
      cycle.nodes.push(cycle);
      rejected(() => braces[method](cycle));
      const parentCycle = { type: 'paren', nodes: [], parent: null };
      parentCycle.parent = parentCycle;
      rejected(() => braces[method](parentCycle));
      const invalidParent = {
        type: 'root',
        nodes: [{ type: 'text', value: 'x', parent: {} }],
      };
      invalidParent.nodes[0].parent.parent = invalidParent.nodes[0].parent;
      rejected(() => braces[method](invalidParent));
      const oversized = {
        type: 'root',
        nodes: Array.from({ length: 65536 }, () => ({
          type: 'text',
          value: '',
        })),
      };
      rejected(() => braces[method](oversized));
    }
    for (const path of [
      dependencies.compilePath,
      dependencies.expandPath,
      dependencies.stringifyPath,
    ]) {
      rejected(() => require(path)(nestedAst(2048)));
    }
    assert.equal(braces.compile(nestedAst(128)), 'ok');
    assert.equal(braces.stringify(nestedAst(128)), 'ok');
    rejected(() => braces.compile(nestedAst(129)));
    const parsed = braces.parse('prefix/{a,b}/suffix');
    assert.equal(braces.stringify(parsed.nodes[2]), '{a,b}');
    const cyclicArray = [];
    cyclicArray.push(cyclicArray);
    rejected(() => require(dependencies.utilsPath).flatten(cyclicArray));
  },
  'brace-consumers': () => {
    assert.deepEqual(braces('src/{api,web}/*.ts'), ['src/(api|web)/*.ts']);
    assert.deepEqual(braces.expand('src/{api,web}/{1..3}.ts'), [
      'src/api/1.ts',
      'src/api/2.ts',
      'src/api/3.ts',
      'src/web/1.ts',
      'src/web/2.ts',
      'src/web/3.ts',
    ]);
    assert.deepEqual(braces.expand('file-{01..03}.txt'), [
      'file-01.txt',
      'file-02.txt',
      'file-03.txt',
    ]);
    assert.equal(
      braces.stringify(braces.parse('x/{a,{b,c}}/y')),
      'x/{a,{b,c}}/y',
    );
    assert.deepEqual(braces.expand('x/\\{a,b\\}'), ['x/{a,b}']);
    assert.deepEqual(braces.expand('x/{a,b'), ['x/{a,b']);
    const micromatch = require(dependencies.micromatchPath);
    assert.deepEqual(micromatch(['a.ts', 'a.js', 'a.css'], '*.{ts,js}'), [
      'a.ts',
      'a.js',
    ]);
    const glob = require(dependencies.globPath);
    const tasks = glob.generateTasks(['apps/{api,web}/package.json']);
    assert.ok(tasks.length > 0);
    const files = glob.sync('apps/{api,web}/package.json', {
      cwd: repositoryRoot,
    });
    assert.deepEqual(files.sort(), [
      'apps/api/package.json',
      'apps/web/package.json',
    ]);
    rejected(() =>
      glob.generateTasks(['{'.repeat(2048) + 'x' + '}'.repeat(2048)]),
    );
  },
  'formatter-invalid': () => {
    for (const suffix of ['e', 'f', 'g']) {
      for (const digits of ['101', '999999', '9'.repeat(400)]) {
        const directive = `%.${digits}${suffix}`;
        assert.equal(
          sprintf(`${directive} %s`, 1, 'after'),
          `${directive} after`,
        );
        assert.equal(vsprintf(directive, [1]), directive);
      }
    }
    assert.equal(sprintf('%.0g %s', 1, 'after'), '%.0g after');
    assert.equal(sprintf('%2$.101f %1$s', 'after', 1), '%2$.101f after');
    assert.equal(
      sprintf('%(amount).101f %(name)s', { amount: 1, name: 'after' }),
      '%(amount).101f after',
    );
    const direct = sprintf.parse('%.2f');
    direct[0][7] = Infinity;
    assert.equal(sprintf.format(direct, ['%.2f', 1]), '%.2f');
    direct[0][7] = Symbol('fictional');
    assert.equal(sprintf.format(direct, ['%.2f', 1]), '%.2f');
  },
  'formatter-normal': () => {
    assert.equal(sprintf('%.2f', 1.25), '1.25');
    assert.equal(sprintf('%.0f', 1.25), '1');
    assert.equal(sprintf('%.0e', 1.25), '1e+0');
    assert.equal(sprintf('%.1g', 1.25), '1');
    assert.equal(sprintf('%.100f', 1), '1.' + '0'.repeat(100));
    assert.equal(sprintf('%.100e', 1), '1.' + '0'.repeat(100) + 'e+0');
    assert.equal(sprintf('%.100g', 1), '1.' + '0'.repeat(99));
    assert.equal(sprintf('%2$s %1$04d', 7, 'item'), 'item 0007');
    assert.equal(
      sprintf('%(name)s %(value).2f', { name: 'item', value: 1.25 }),
      'item 1.25',
    );
    assert.equal(vsprintf('%s %d %%', ['item', 7]), 'item 7 %');
    assert.equal(sprintf('%.3s', 'abcdef'), 'abc');
    assert.throws(() => sprintf('%.-1f', 1), SyntaxError);
  },
  'formatter-native-bounds': () => {
    const originals = new Map();
    let calls = 0;
    for (const name of ['toFixed', 'toExponential', 'toPrecision']) {
      originals.set(name, Number.prototype[name]);
      Number.prototype[name] = function (precision) {
        assert.ok(
          precision === undefined ||
            (Number.isInteger(Number(precision)) &&
              Number(precision) >= (name === 'toPrecision' ? 1 : 0) &&
              Number(precision) <= 100),
        );
        calls++;
        return originals.get(name).call(this, precision);
      };
    }
    try {
      for (const suffix of ['f', 'e', 'g'])
        assert.equal(sprintf(`%.101${suffix}`, 1), `%.101${suffix}`);
      assert.equal(sprintf('%.0g', 1), '%.0g');
      assert.equal(calls, 0);
      assert.equal(sprintf('%.2f', 1), '1.00');
      assert.equal(calls, 1);
    } finally {
      for (const [name, original] of originals)
        Number.prototype[name] = original;
    }
  },
  'formatter-async': async () => {
    // No catch/uncaughtException handler: invalid precision must not unwind the event loop.
    await new Promise((resolve) =>
      setImmediate(() => {
        assert.equal(sprintf('%.101f', 1), '%.101f');
        assert.equal(sprintf('%.0g', 1), '%.0g');
        assert.equal(sprintf('%s', 'still running'), 'still running');
        resolve();
      }),
    );
  },
  'coverage-consumers': () => {
    const { ArgumentParser } = require(dependencies.argparsePath);
    const parser = new ArgumentParser({
      prog: 'fictional',
      addHelp: false,
      usage: '%(prog)s',
    });
    parser.addArgument('--count', { help: '%(prog)s count' });
    assert.match(parser.formatHelp(), /fictional/);
    const malformed = new ArgumentParser({
      prog: 1,
      addHelp: false,
      usage: '%(prog).101f',
    });
    assert.match(malformed.formatHelp(), /%\(prog\)\.101f/);
    const babel = require(dependencies.babelPath);
    const result = babel.transformSync(
      'module.exports = function fictional(x) { return x + 1; };',
      {
        filename: `${repositoryRoot}/apps/api/src/fictional-coverage-contract.js`,
        cwd: repositoryRoot,
        babelrc: false,
        configFile: false,
        plugins: [
          [
            require(dependencies.istanbulPath),
            { cwd: repositoryRoot, exclude: [], include: ['**/*'] },
          ],
        ],
      },
    );
    assert.match(result.code, /__coverage__/);
  },
};

const name = process.argv[2];
assert.ok(Object.hasOwn(cases, name), 'Select a defined mitigation check');
await cases[name]();
console.log(`${name}: passed`);
