import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveToolchainSecurityConsumers } from './toolchain-security-consumers.mjs';

const consumers = resolveToolchainSecurityConsumers();
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

async function withFixture(callback) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'webhost-toolchain-'));
  const files = [
    'main.ts',
    'nested/child.ts',
    'nested/readme.txt',
    '.hidden.ts',
  ];
  fs.mkdirSync(join(directory, 'nested'));
  for (const file of files) fs.writeFileSync(join(directory, file), 'fixture');
  try {
    await callback(directory);
  } finally {
    // Delete only the exact files/directories created by this fixture.
    assert.equal(dirname(directory), resolve(tmpdir()));
    for (const file of files) fs.unlinkSync(join(directory, file));
    fs.rmdirSync(join(directory, 'nested'));
    fs.rmdirSync(directory);
  }
}

const cases = {
  'consumer-resolution': () => {
    assert.equal(consumers.web('vitest/package.json').version, '4.1.12');
    assert.equal(
      consumers.vitest('@vitest/mocker/package.json').version,
      '4.1.12',
    );
    for (const request of consumers.viteConsumers)
      assert.equal(request('vite/package.json').version, '7.3.7');
    assert.equal(consumers.hooks('zod/package.json').version, '4.6.6');
    assert.equal(consumers.modernMatcher.version, '11.0.1');
    for (const entry of consumers.modernGlobs)
      assert.equal(entry.version, '14.0.2');
    for (const entry of consumers.merges) assert.equal(entry.version, '4.3.1');
  },
  'zod-bounds': () => {
    const { z } = consumers.hooks('zod');
    const result = z
      .array(z.number())
      .max(1)
      .safeParse(Array(25_000).fill('invalid'));
    assert.equal(result.success, false);
    assert.ok(
      result.error.issues.length <= 2,
      'Collection rejection must stay bounded',
    );
    assert.deepEqual(z.array(z.number()).max(2).parse([1, 2]), [1, 2]);
  },
  'modern-match-bounds': () => {
    const { Minimatch, minimatch } = consumers.modernMatcher.module;
    const amplified = new Minimatch('**/../a/'.repeat(10) + '*.ts', {
      optimizationLevel: 2,
      braceExpandMax: 16,
    });
    assert.ok(amplified.globParts.length > 1);
    assert.ok(
      amplified.globParts.length <= 16,
      'Pattern cloning exceeded its budget',
    );
    assert.equal(minimatch('nested/child.ts', '**/*.{ts,js}'), true);
    assert.equal(minimatch('.hidden.ts', '**/*.ts'), false);
    assert.equal(
      new Minimatch('**/*.ts', { dot: true }).match('.hidden.ts'),
      true,
    );
  },
  'legacy-match-compatibility': () => {
    for (const entry of consumers.legacyMatchers) {
      assert.equal(entry.version, '3.1.5');
      assert.equal(typeof entry.module, 'function');
      assert.equal(
        entry.module.Minimatch.prototype.firstPhasePreProcess,
        undefined,
      );
      const source = fs.readFileSync(entry.path, 'utf8');
      assert.doesNotMatch(source, /firstPhasePreProcess|globParts\.push\(/);
      const matcher = new entry.module.Minimatch(
        '**/../'.repeat(128) + '*.ts',
        {
          optimizationLevel: 2,
        },
      );
      assert.equal(matcher.globParts.length, 1);
      assert.equal(entry.module('nested/child.ts', '**/*.{ts,js}'), true);
      assert.deepEqual(entry.module.match(['main.ts', 'readme.txt'], '*.ts'), [
        'main.ts',
      ]);
      assert.equal(
        entry.module.defaults({ nocase: true })('MAIN.TS', '*.ts'),
        true,
      );
    }
  },
  'glob-compatibility': () =>
    withFixture(async (cwd) => {
      const expected = ['main.ts', 'nested/child.ts'];
      for (const { module: glob } of consumers.modernGlobs) {
        const options = { cwd, nodir: true, posix: true };
        assert.deepEqual(glob.globSync('**/*.ts', options).sort(), expected);
        assert.deepEqual(
          (await glob.glob('**/*.ts', options)).sort(),
          expected,
        );
        const iterated = [];
        for await (const path of glob.globIterate('**/*.ts', options))
          iterated.push(path);
        assert.deepEqual(iterated.sort(), expected);
        assert.deepEqual(
          glob.globSync('**/*.ts', { ...options, ignore: 'nested/**' }),
          ['main.ts'],
        );
      }
      const normalize = (paths) =>
        paths.map((path) => path.replaceAll('\\', '/')).sort();
      assert.deepEqual(
        normalize(consumers.legacyGlob.sync('**/*.ts', { cwd, nodir: true })),
        expected,
      );
      const callback = await new Promise((accept, reject) =>
        consumers.legacyGlob('**/*.ts', { cwd, nodir: true }, (error, paths) =>
          error ? reject(error) : accept(paths),
        ),
      );
      assert.deepEqual(normalize(callback), expected);
    }),
  'glob-cancellation': () =>
    withFixture(async (cwd) => {
      for (const { module: glob } of consumers.modernGlobs) {
        const controller = new AbortController();
        const reason = new Error('Fictional cancellation');
        let reads = 0;
        const instrumented = {
          ...fs,
          readdir(path, options, callback) {
            reads++;
            fs.readdir(path, options, (error, entries) => {
              controller.abort(reason);
              callback(error, entries);
            });
          },
        };
        await assert.rejects(
          glob.glob('**/*', {
            cwd,
            fs: instrumented,
            signal: controller.signal,
          }),
        );
        const atRejection = reads;
        assert.equal(atRejection, 1);
        await delay(80);
        assert.equal(
          reads,
          atRejection,
          'Aborted traversal continued reading directories',
        );
        assert.throws(() =>
          glob.globSync('**/*', { cwd, signal: controller.signal }),
        );
      }
    }),
  'deepmerge-poisoning': () => {
    for (const entry of consumers.merges) {
      // Test the actual Node consumer and the separately shipped UMD entry.
      const umd = consumers.api(join(dirname(entry.path), 'umd.js'));
      for (const merge of [entry.module, umd]) {
        const poisoned = () =>
          JSON.parse('{"__proto__":{"command159Poisoned":true}}');
        for (const result of [
          merge(Object.create(null), poisoned()),
          merge(poisoned(), {}),
          merge({ session: null }, { session: poisoned() }).session,
          merge({}, { items: [poisoned()] }).items[0],
          merge.all([Object.create(null), poisoned()]),
        ]) {
          assert.equal(Object.getPrototypeOf(result), Object.prototype);
          assert.equal(Object.hasOwn(result, '__proto__'), false);
          assert.equal(result.command159Poisoned, undefined);
        }
        assert.equal({}.command159Poisoned, undefined);
      }
    }
  },
  'deepmerge-compatibility': () => {
    for (const { module: merge } of consumers.merges) {
      const symbol = Symbol('configuration');
      const date = new Date('2026-01-01T00:00:00Z');
      const input = {
        list: [{ id: 1 }],
        nested: { left: true },
        [symbol]: 'value',
        date,
      };
      const result = merge(input, {
        list: [{ id: 2 }],
        nested: { right: true },
      });
      assert.deepEqual(result.list, [{ id: 1 }, { id: 2 }]);
      assert.deepEqual(result.nested, { left: true, right: true });
      assert.equal(result[symbol], 'value');
      assert.equal(result.date, date);
      assert.notEqual(result.list[0], input.list[0]);
      assert.equal(merge({}, input, { clone: false }).list, input.list);
      assert.deepEqual(
        merge(
          { list: [1] },
          { list: [2] },
          {
            arrayMerge: (_target, source) => source,
          },
        ),
        { list: [2] },
      );
      assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 });
    }
  },
  'mocker-source': async () => {
    const { createManualModuleSource } = await import(
      pathToFileURL(consumers.vitest.resolve('@vitest/mocker/node'))
    );
    const url = 'module\";globalThis.command159Injected=true;//';
    const exportName = 'name\";globalThis.command159Injected=true;//';
    const factory = { default: 'normal', [exportName]: 'safe value' };
    globalThis.__vitest_mocker__ = {
      getFactoryModule(value) {
        assert.equal(value, url);
        return factory;
      },
    };
    try {
      const source = createManualModuleSource(url, Object.keys(factory));
      const module = await import(
        'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
      );
      assert.equal(module.default, 'normal');
      assert.equal(module[exportName], 'safe value');
      assert.equal(globalThis.command159Injected, undefined);
    } finally {
      delete globalThis.__vitest_mocker__;
    }
  },
  'mocker-redirect': () =>
    withFixture(async (directory) => {
      const vite = await import(
        pathToFileURL(consumers.vitest.resolve('vite'))
      );
      const { interceptorPlugin } = await import(
        pathToFileURL(consumers.vitest.resolve('@vitest/mocker/node'))
      );
      const root = join(directory, 'nested');
      const config = await vite.resolveConfig(
        {
          root,
          configFile: false,
          envFile: false,
          logLevel: 'silent',
          server: { fs: { strict: true, allow: [root], deny: [] } },
        },
        'serve',
      );
      const handlers = new Map(),
        registered = [];
      const plugin = interceptorPlugin({
        registry: {
          register(event) {
            registered.push(event);
          },
        },
      });
      plugin.configureServer({
        config,
        ws: {
          on(name, handler) {
            handlers.set(name, handler);
          },
          send() {},
        },
      });
      const register = handlers.get('vitest:interceptor:register');
      // Opaque URLs retain the traversal until the plugin normalizes the pathname.
      // Hierarchical URLs can normalize dot segments before reaching the plugin.
      for (const redirect of ['mock:../main.ts', 'mock:..\\main.ts']) {
        register({ type: 'redirect', redirect });
        assert.equal(
          registered.length,
          0,
          'Redirect escaped the configured fixture root',
        );
      }
      register({ type: 'redirect', redirect: 'mock:///child.ts' });
      assert.equal(registered.length, 1);
      assert.equal(
        registered[0].redirect.replaceAll('\\', '/'),
        join(root, 'child.ts').replaceAll('\\', '/'),
      );
    }),
};

const name = process.argv[2];
assert.ok(Object.hasOwn(cases, name), 'Unknown security probe');
await cases[name]();
console.log(`${name}: passed`);
