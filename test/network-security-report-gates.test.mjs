import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';

const toolSource = await readFile(new URL('../tools/test-wmusic-network-security.mjs', import.meta.url), 'utf8');

// Execute the complete maintained launcher with synthetic IO. Only ESM import/export
// syntax and import.meta.url are adapted for Script; no production algorithm is copied.
// No filesystem mutation, process lookup, signal, dependency or Electron launch escapes.
async function launcherModel({ foreignReader = false, scratchAlias = null, layout = 'direct', protectedAliases = false,
  failAt = null, driftAt = null, dangling = false, boundary = null, protectedRoot = 'repo',
  protectedFailureRoot = null, protectedFailureMode = 'drift', complete = false,
  protectedFailureBefore = 'stdout.log' } = {}) {
  const model = resolve('C:/wmusic-SYNTHETIC-launcher');
  const repoInput = join(model, 'repo'), runtimeInput = join(model, 'runtime');
  const repo = protectedAliases ? join(model, 'canonical-repo') : repoInput;
  const runtime = protectedAliases ? join(model, 'canonical-runtime') : runtimeInput;
  const alias = join(model, 'scratch');
  const protectedInput = protectedRoot === 'repo' ? repoInput : runtimeInput;
  const boundaries = { same: protectedInput, ordinary: join(protectedInput, 'ordinary-child'),
    'dotdot-child': join(protectedInput, '..legitimate-child'), 'dotdot-nested': join(protectedInput, '..legitimate-child', 'nested'),
    'parent-traversal': join(protectedInput, '..', 'outside', 'child'), sibling: protectedInput + '-neighbor' };
  const scratch = boundaries[boundary] || (layout === 'nested' ? join(alias, 'existing-nested') : layout === 'missing' ? join(alias, 'missing', 'leaf') : alias);
  const outside = join(model, 'canonical-outside');
  const aliasDestination = scratchAlias === 'repo-dotdot' ? join(repo, '..legitimate-child')
    : scratchAlias === 'runtime-dotdot' ? join(runtime, '..legitimate-child')
    : scratchAlias === 'repo' ? repo : scratchAlias === 'runtime' ? runtime : scratchAlias === 'outside' ? outside : alias;
  const sourcePath = join(repoInput, 'tools/test-wmusic-network-security.mjs');
  const sourceUrl = pathToFileURL(sourcePath).href;
  const effects = [], files = new Map(), removed = new Set();
  const created = new Set();
  let drift = null, protectedInvalid = false;
  const invalidRoot = protectedFailureRoot === 'runtime' ? runtime : repo;
  const untrusted = join(model, 'untrusted-protected-target');
  const initialPhysical = target => {
    for (const [from, to] of [[repoInput, repo], [runtimeInput, runtime],
      [alias, aliasDestination]]) {
      if (target === from || target.startsWith(from + sep)) return join(to, relative(from, target));
    }
    return target;
  };
  const physical = target => { const value = initialPhysical(resolve(target));
    if (protectedInvalid && protectedFailureMode === 'drift' && (value === invalidRoot || value.startsWith(invalidRoot + sep))) {
      return join(untrusted, relative(invalidRoot, value));
    }
    return drift && (value === drift || value.startsWith(drift + sep)) ? join(repo, relative(drift, value)) : value; };
  const missing = () => Object.assign(new Error('SYNTHETIC missing'), { code: 'ENOENT' });
  const absent = new Set(layout === 'missing' ? [scratch, dirname(scratch), initialPhysical(scratch), initialPhysical(dirname(scratch))] : []);
  let runRoot, foreignAlive = foreignReader, exitCode, finish;
  const finished = new Promise(done => { finish = done; });
  const bytes = Buffer.from('SYNTHETIC immutable file\n');
  let inventoryPasses = 0, faultInjected = false, nativeCompleted = false;
  const livePids = new Set();
  const packagePath = name => join(runtime, 'node_modules', name, 'package.json');
  const electronPackage = packagePath('electron'), externalPackage = packagePath('undici');
  const nodeGypPackage = packagePath('node-gyp'), playwrightPackage = packagePath('playwright-core');
  const nestedPackage = join(dirname(nodeGypPackage), 'node_modules/undici/package.json');
  const executable = join(dirname(electronPackage), 'dist/electron.exe');
  if (complete) for (const path of [electronPackage, externalPackage, nodeGypPackage, nestedPackage, playwrightPackage]) {
    files.set(path, JSON.stringify({ version: '0.0.0-SYNTHETIC' }));
  }
  const completedWrite = name => [...files.keys()].some(path => path.endsWith(join('evidence', name)));
  const failureReady = () => protectedFailureBefore === 'retained-finally' ? nativeCompleted && inventoryPasses === 1
    : protectedFailureBefore === 'governed-after.json' ? inventoryPasses === 2
    : protectedFailureBefore === 'stdout.log' ? completedWrite('governed-after.json')
      : protectedFailureBefore === 'stderr.log' ? completedWrite('stdout.log') : completedWrite('stderr.log');
  const fs = {
    realpath: async target => {
      const value = resolve(target), effect = { operation: 'realpath', target: value }; effects.push(effect);
      if (complete && protectedFailureRoot && !faultInjected && value === invalidRoot && failureReady()) {
        faultInjected = true; protectedInvalid = true;
      }
      if (protectedInvalid && protectedFailureMode !== 'stable' && value === invalidRoot) {
        effect.revalidationFailure = true;
        if (protectedFailureMode === 'error' || protectedFailureMode === 'recovering-error') {
          if (protectedFailureMode === 'recovering-error') protectedInvalid = false;
          throw Object.assign(new Error('SYNTHETIC protected revalidation denied'), { code: 'EACCES' });
        }
      }
      const createdKind = value === runRoot ? 'run' : value === join(runRoot || alias, 'live') ? 'live'
        : value === join(runRoot || alias, 'evidence') ? 'evidence' : null;
      if ((failAt === 'repo' && value === repoInput) || (failAt === 'runtime' && value === runtimeInput)
        || (failAt === 'scratch' && value === scratch) || (failAt && createdKind === failAt && created.has(value))) {
        throw Object.assign(new Error('SYNTHETIC canonicalization denied'), { code: 'EACCES' });
      }
      if (absent.has(value) || (dangling && value === alias)) throw missing();
      return physical(value);
    },
    lstat: async target => { effects.push({ operation: 'lstat', target, physical: physical(target) });
      if (absent.has(resolve(target))) throw missing(); return { isSymbolicLink: () => true }; },
    mkdir: async target => {
      effects.push({ operation: 'mkdir', target, physical: physical(target) }); created.add(target);
      for (const name of absent) if (target === name || target.startsWith(name + sep)) absent.delete(name);
      if (driftAt === 'scratch' && target === initialPhysical(scratch)) drift = target;
      if ((driftAt === 'live' && target === join(runRoot || alias, 'live'))
        || (driftAt === 'evidence' && target === join(runRoot || alias, 'evidence'))) drift = target;
    },
    mkdtemp: async prefix => { runRoot = prefix + 'SYNTHETIC'; effects.push({ operation: 'mkdtemp', target: runRoot, physical: physical(runRoot) });
      created.add(runRoot); if (driftAt === 'run') drift = runRoot; return runRoot; },
    readdir: async target => {
      effects.push({ operation: 'readdir', target, physical: physical(target) });
      if (target === join(repo, 'src')) inventoryPasses++;
      return (protectedFailureRoot || complete) && [join(repo, 'src'), join(repo, 'out')].includes(target)
        ? [{ name: 'synthetic-inventory-file', isDirectory: () => false, isFile: () => true }] : [];
    },
    stat: async target => { effects.push({ operation: 'stat', target, physical: physical(target) });
      if (removed.has(target)) throw missing(); return { size: files.has(target) ? Buffer.byteLength(files.get(target)) : bytes.length }; },
    readFile: async target => { effects.push({ operation: 'readFile', target, physical: physical(target) });
      if (!files.has(target)) throw missing(); return files.get(target); },
    writeFile: async (target, value) => { files.set(target, String(value)); effects.push({ operation: 'writeFile', target, physical: physical(target) }); },
    rm: async target => { removed.add(target); effects.push({ operation: 'rm', target, physical: physical(target) }); },
  };
  function execFile() { throw new Error('Unexpected callback execution'); }
  execFile[promisify.custom] = async (filename, args) => {
    const script = filename === 'powershell.exe' ? Buffer.from(args.at(-1), 'base64').toString('utf16le') : null;
    effects.push({ operation: 'execFile', filename, args: [...args], script });
    if (complete) {
      if (filename === 'powershell.exe') {
        const requested = [...script.matchAll(/ProcessId = (\d+)/g)].map(match => Number(match[1]));
        assert.ok(requested.length > 0);
        return { stdout: JSON.stringify(requested.filter(pid => livePids.has(pid)).map(ProcessId => ({ ProcessId }))), stderr: '' };
      }
      if (filename === join(model, 'openssl.exe')) {
        for (const name of ['ca.crt', 'valid.crt', 'mismatch.crt']) files.set(join(runRoot, 'live/certs', name), 'SYNTHETIC public certificate');
        return { stdout: 'SYNTHETIC openssl mock', stderr: '' };
      }
      assert.equal(filename, join(model, 'node.exe'));
      assert.equal(args[0], '--check');
      return { stdout: '', stderr: '' };
    }
    if (filename === 'powershell.exe') return { stdout: JSON.stringify(foreignAlive ? [{ ProcessId: 900001, ParentProcessId: 900000,
      Name: 'SYNTHETIC-unrelated-editor.exe', ExecutablePath: join(model, 'editor.exe'), CreationDate: 'SYNTHETIC-foreign-created',
      CommandLine: `editor.exe ${join(runRoot, 'evidence/report.json')}` }] : []), stderr: '' };
    if (filename === 'taskkill.exe') { foreignAlive = false; return { stdout: '', stderr: '' }; }
    throw new Error('Unexpected mocked executable ' + filename);
  };
  const launch = async options => {
    effects.push({ operation: 'mock-electron-launch' });
    const code = files.get(options.args[0]), at = code.lastIndexOf(')({');
    assert.ok(at > 0, 'read serialized fixture configuration, never execute the native host');
    const config = JSON.parse(code.slice(at + 2, -3));
    const identity = { pid: 900004, ppid: 900003, execPath: executable, type: 'browser',
      versions: { electron: '0.0.0-SYNTHETIC' }, paths: config.paths, processMetrics: [{ pid: 900004 }, { pid: 900005 }] };
    const child = { pid: 900003, exitCode: null, signalCode: null };
    for (const pid of [900003, 900004, 900005]) livePids.add(pid);
    const native = syntheticPassingReport();
    for (const row of native.cases) if (row.id.includes('/after-global-dispatcher/sri/')) row.observation.dispatchDelta = 1;
    Object.assign(native, { identity, processMetrics: identity.processMetrics, deniedNetwork: [],
      externalImport: { path: join(dirname(externalPackage), 'index.js'), version: '0.0.0-SYNTHETIC' },
      dispatcherInstallation: { installedIdentityVerified: true, globalFetchFunctionUnchanged: true } });
    files.set(join(config.evidence, 'startup.json'), JSON.stringify({ identity, containment: { verified: true } }));
    files.set(join(config.evidence, 'native-observations.json'), JSON.stringify(native));
    return { process: () => child, evaluate: async callback => {
      const text = callback.toString();
      if (text.includes('__wmusicNetworkProbe.run')) { nativeCompleted = true; return native; }
      if (!text.includes('app.quit()')) return identity;
      effects.push({ operation: 'inspector-graceful-quit-request' });
      await callback({ app: { quit() {
        effects.push({ operation: 'mock-app-quit' }); child.exitCode = 0; livePids.clear();
        files.set(join(config.evidence, 'lifecycle.jsonl'), JSON.stringify({ event: 'quit', code: 0 }) + '\n');
      } } });
      await new Promise(done => setImmediate(done));
      return true;
    } };
  };
  const createRequire = anchor => {
    const request = id => {
      if (complete) {
        if (id === 'electron') return executable;
        assert.equal(id, 'playwright-core'); return { _electron: { launch } };
      }
      if (driftAt === 'late-live') drift = join(runRoot, 'live');
      if (driftAt === 'late-evidence') drift = join(runRoot, 'evidence');
      if (protectedFailureRoot) protectedInvalid = true;
      throw new Error('SYNTHETIC preflight stopped before Electron launch');
    };
    request.resolve = complete ? id => {
      const undici = anchor === nodeGypPackage ? nestedPackage : externalPackage;
      const paths = { 'electron/package.json': electronPackage, 'undici/package.json': undici,
        'node-gyp/package.json': nodeGypPackage, 'playwright-core/package.json': playwrightPackage, undici: join(dirname(undici), 'index.js') };
      assert.ok(paths[id], 'unmodelled package lookup'); return paths[id];
    } : request; return request;
  };
  const process = { argv: ['SYNTHETIC-node', sourcePath, '--runtime-root', runtimeInput, '--scratch-root', scratch, '--openssl', join(model, 'openssl.exe')],
    platform: 'win32', pid: 900002, execPath: join(model, 'node.exe'), versions: { node: 'SYNTHETIC' },
    kill: (pid, signal) => { effects.push({ operation: 'signal', pid, signal });
      assert.equal(signal, 0, 'synthetic liveness is never termination authority');
      if (complete && livePids.has(pid)) return true;
      if (pid === 900001 && foreignAlive) return true; throw Object.assign(new Error('SYNTHETIC dead'), { code: 'ESRCH' }); } };
  Object.defineProperty(process, 'env', { get() { if (complete) return { Path: 'SYNTHETIC', SystemRoot: 'SYNTHETIC' }; throw new Error('Preflight must not read environment'); } });
  Object.defineProperty(process, 'exitCode', { get() { return exitCode; }, set(value) { exitCode = value; finish(); } });
  const script = toolSource.replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '').replaceAll('import.meta.url', 'sourceUrl');
  runInNewContext(script, { assert, fs, process, Buffer, sourceUrl, createHash,
    createReadStream: target => { effects.push({ operation: 'readStream', target, physical: physical(target) }); return Readable.from([files.has(target) ? files.get(target) : bytes]); },
    createRequire, dirname, isAbsolute, join, relative, resolve, sep, fileURLToPath, execFile, promisify, setTimeout, clearTimeout, setImmediate,
    console: { log: text => effects.push({ operation: 'log', text }), error: text => effects.push({ operation: 'error', text }) } }, { timeout: 1000 });
  let timer;
  try { await Promise.race([finished, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Launcher model timeout')), 3000); })]); }
  finally { clearTimeout(timer); }
  const reportFile = [...files.keys()].find(target => target.endsWith(join('evidence', 'report.json')));
  const summaryLine = effects.findLast(row => row.operation === 'log')?.text;
  return { effects, exitCode, repo, runtime, scratch, outside, untrusted, files, summary: summaryLine ? JSON.parse(summaryLine) : null,
    report: reportFile ? JSON.parse(files.get(reportFile)) : null };
}

for (const protectedRoot of ['repo', 'runtime']) {
  for (const variant of ['direct', 'nested', 'alias', 'alias-missing']) {
    test(`R2-PATH-SEGMENT full launcher refuses ${protectedRoot} dotdot-prefixed ${variant} before mutation`, async () => {
      const options = variant === 'direct' || variant === 'nested'
        ? { protectedRoot, boundary: variant === 'direct' ? 'dotdot-child' : 'dotdot-nested' }
        : { scratchAlias: `${protectedRoot}-dotdot`, layout: variant === 'alias' ? 'direct' : 'missing' };
      const result = await launcherModel(options);
      assert.deepEqual(result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), [],
        'a real ..legitimate-child segment is a protected descendant: refuse BEFORE the first mutation');
      assert.equal(result.exitCode, 1);
      assert.equal(result.report, null);
      assert.ok(result.effects.some(row => row.operation === 'error' && row.text.includes('outside repo/runtime-root')));
    });
  }
}

function assertUnsafeFailstop(result) {
  const detection = result.effects.findIndex(row => row.revalidationFailure);
  assert.ok(detection >= 0, 'the actual launcher must reach protected-root revalidation after its baseline');
  assert.ok(result.effects.slice(0, detection).some(row => row.operation === 'readStream'), 'the baseline contains real synthetic inventory reads');
  assert.ok(result.summary.cleanup.errors.some(row => row.operation === 'scratch-path-validation'), 'verifyRoots must detect and latch unsafe paths');
  assert.deepEqual(result.effects.slice(detection + 1).filter(row =>
    ['readdir', 'readStream', 'readFile', 'stat', 'mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), [],
  'once verifyRoots has latched unsafe, no governed inventory/readback or mutation may continue');
  assert.equal(result.exitCode, 1);
  assert.equal(result.report, null);
  assert.equal(result.summary.cleanup.verified, false);
  assert.equal(result.summary.securityAccepted, false);
  assert.notEqual(result.summary.unchanged?.verified, true, 'unreadable protected roots cannot be certified unchanged');
  assert.equal(result.effects.slice(detection + 1).filter(row => row.operation === 'realpath').length, 0,
    'unsafe is latched: even a subsequently restored root must not be probed or traversed again');
}

test('R2-FAILSTOP full launcher stops governed reads after baseline repo identity is invalidated', async () => {
  assertUnsafeFailstop(await launcherModel({ protectedFailureRoot: 'repo' }));
});

// These variants depend on the same fix; only the core above supplied the initial product RED.
for (const protectedFailureRoot of ['repo', 'runtime']) {
  for (const protectedFailureMode of ['drift', 'error', 'recovering-error']) {
    if (protectedFailureRoot === 'repo' && protectedFailureMode === 'drift') continue;
    test(`R2-FAILSTOP full launcher latches ${protectedFailureRoot} ${protectedFailureMode} after baseline`, async () => {
      assertUnsafeFailstop(await launcherModel({ protectedFailureRoot, protectedFailureMode }));
    });
  }
  test(`R2-FAILSTOP-CONTROL full launcher reads unchanged ${protectedFailureRoot} roots without a false unsafe latch`, async () => {
    const result = await launcherModel({ protectedFailureRoot, protectedFailureMode: 'stable' });
    assert.equal(result.effects.some(row => row.revalidationFailure), false);
    assert.ok(result.effects.some(row => row.operation === 'readStream'));
    assert.equal(result.report.unchanged.verified, true);
    assert.equal(result.report.unchanged.sourceFiles, 1);
    assert.equal(result.report.unchanged.outputFiles, 1);
    assert.equal(result.report.cleanup.liveRemoved, true);
    assert.equal(result.report.cleanup.errors.some(row => row.operation === 'scratch-path-validation'), false);
    assert.equal(result.exitCode, 1, 'the intentional dependency preflight failure is still rejecting');
    assert.match(result.report.diagnostics[0].message, /preflight stopped before Electron launch/);
  });
}

// Adjacent controls are naturally green, not additional RED-to-GREEN fixes.
for (const protectedRoot of ['repo', 'runtime']) {
  for (const boundary of ['same', 'ordinary', 'parent-traversal', 'sibling']) {
    test(`R2-PATH-CONTROL full launcher keeps ${protectedRoot} ${boundary} semantics`, async () => {
      const result = await launcherModel({ protectedRoot, boundary });
      const mutations = result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation));
      assert.equal(result.exitCode, 1);
      if (boundary === 'same' || boundary === 'ordinary') {
        assert.deepEqual(mutations, []);
        assert.equal(result.report, null);
        assert.ok(result.effects.some(row => row.operation === 'error' && row.text.includes('outside repo/runtime-root')));
      } else {
        assert.ok(mutations.length > 0, 'genuine traversal to outside and adjacent siblings remain allowed scratch selections');
        assert.match(result.report.diagnostics[0].message, /preflight stopped before Electron launch/);
        for (const row of mutations) {
          assert.equal(row.target, row.physical);
          // Walk parents as an independent oracle, not the production relative-path predicate.
          for (let current = row.physical; ; current = dirname(current)) {
            assert.notEqual(current, result.repo);
            assert.notEqual(current, result.runtime);
            if (dirname(current) === current) break;
          }
        }
      }
    });
  }
}

for (const protectedRoot of ['repo', 'runtime']) {
  test(`R2 full launcher rejects a direct scratch alias into ${protectedRoot} before its first write`, async () => {
    const result = await launcherModel({ scratchAlias: protectedRoot });
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), [],
      'physical protected-root aliases must be rejected BEFORE mutation, not detected by a later inventory');
    assert.equal(result.report, null);
  });
}

for (const protectedRoot of ['repo', 'runtime']) {
  for (const layout of ['nested', 'missing']) {
    test(`R2 ${layout} scratch ancestry alias into ${protectedRoot} is rejected before mutation`, async () => {
      const result = await launcherModel({ scratchAlias: protectedRoot, layout });
      assert.equal(result.exitCode, 1);
      assert.equal(result.report, null);
      assert.deepEqual(result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), []);
      assert.ok(result.effects.some(row => row.operation === 'error' && row.text.includes('outside repo/runtime-root')));
    });
  }
  test(`R2 protected ${protectedRoot} itself is canonicalized before scratch alias comparison`, async () => {
    const result = await launcherModel({ scratchAlias: protectedRoot, protectedAliases: true });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report, null);
    assert.deepEqual(result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), []);
    assert.ok(result.effects.some(row => row.operation === 'error' && row.text.includes('outside repo/runtime-root')));
  });
}
for (const layout of ['direct', 'nested', 'missing']) {
  test(`R2 legitimate outside ${layout} scratch uses canonical paths for every mutation`, async () => {
    const result = await launcherModel({ scratchAlias: 'outside', layout });
    assert.equal(result.exitCode, 1, 'the deliberate dependency preflight failure remains rejecting');
    assert.match(result.report.diagnostics[0].message, /preflight stopped before Electron launch/);
    const mutations = result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation));
    assert.ok(mutations.length > 0);
    for (const row of mutations) {
      assert.equal(row.target, row.physical, 'never write through the caller-supplied alias');
      assert.ok(row.physical === result.outside || row.physical.startsWith(result.outside + sep));
    }
    assert.equal(result.report.cleanup.liveRemoved, true);
  });
}
for (const failAt of ['repo', 'runtime', 'scratch']) {
  test(`R2 ${failAt} canonicalization failure rejects before any write`, async () => {
    const result = await launcherModel({ failAt });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report, null);
    assert.deepEqual(result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), []);
    assert.ok(result.effects.some(row => row.operation === 'error' && row.text.includes('SYNTHETIC canonicalization denied')));
  });
}
test('R2 dangling existing scratch ancestry is not mistaken for a nonexistent leaf', async () => {
  const result = await launcherModel({ dangling: true });
  assert.equal(result.exitCode, 1);
  assert.equal(result.report, null);
  assert.deepEqual(result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), []);
  assert.ok(result.effects.some(row => row.operation === 'error' && row.text.includes('unresolvable existing scratch ancestor')));
});
for (const failAt of ['run', 'live', 'evidence']) {
  test(`R2 created ${failAt} canonicalization error refuses further writes and recursive cleanup`, async () => {
    const result = await launcherModel({ failAt });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report, null);
    assert.equal(result.summary.cleanup.verified, false);
    assert.ok(result.summary.cleanup.errors.some(row => row.operation === 'scratch-path-validation'));
    assert.deepEqual(result.effects.filter(row => ['writeFile', 'rm'].includes(row.operation)), []);
  });
}
for (const driftAt of ['scratch', 'run', 'live', 'evidence', 'late-live', 'late-evidence']) {
  test(`R2 ${driftAt} canonical path change fails closed without following the new target`, async () => {
    const result = await launcherModel({ driftAt });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report, null);
    assert.equal(result.summary.cleanup.verified, false);
    assert.ok(result.summary.cleanup.errors.some(row => row.operation === 'scratch-path-validation'));
    const mutations = result.effects.filter(row => ['mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation));
    assert.ok(mutations.length > 0, 'the injected change happens after an owned path was created');
    assert.ok(mutations.every(row => row.physical !== result.repo && !row.physical.startsWith(result.repo + sep)
      && row.physical !== result.runtime && !row.physical.startsWith(result.runtime + sep)));
    assert.deepEqual(mutations.filter(row => row.operation === 'rm'), [], 'uncertain roots must not be removed');
  });
}

test('R1 full launcher preflight failure never signals a foreign evidence reader', async () => {
  const result = await launcherModel({ foreignReader: true });
  assert.equal(result.exitCode, 1);
  assert.match(result.report.diagnostics[0].message, /preflight stopped before Electron launch/);
  assert.deepEqual(result.effects.filter(row => row.filename === 'taskkill.exe' || (row.operation === 'signal' && row.signal !== 0)), [],
    'a command-line evidence substring is not ownership and must never authorize a kill');
  assert.equal(result.report.cleanup.forcedKill, false);
  assert.deepEqual(result.effects.filter(row => row.operation === 'execFile' || row.operation === 'signal'), [],
    'prelaunch failure has no owned process handles or PID hints to query');
  assert.equal(result.report.securityAccepted, false);
});

// Exercise the exact final cleanup statements with retained PID hints and a mocked
// inspector handle. A known-owned survivor is deliberately refused too: this tool
// has no Windows creation-handle authority for any forced termination.
async function cleanupModel({ state = 'natural', queryError = false, extraRow = false } = {}) {
  const mainStart = toolSource.indexOf('async function main(');
  const start = toolSource.indexOf('    if (instance) {', mainStart);
  const end = toolSource.indexOf('    if (evidence) {', start);
  const naturalStart = toolSource.indexOf('    cleanup.nativeQuitCode = ', end);
  const naturalEnd = toolSource.indexOf('    if (live) {', naturalStart);
  const verifiedStart = toolSource.indexOf('    cleanup.verified = ', naturalEnd);
  const verifiedEnd = toolSource.indexOf('    if (baseline) {', verifiedStart);
  const helpers = toolSource.slice(toolSource.indexOf('const alive = '), toolSource.indexOf('export function classifyNativeOutput('));
  assert.ok(start > mainStart && end > start && naturalEnd > naturalStart && verifiedEnd > verifiedStart, 'maintained cleanup boundaries missing');
  const pid = 900003, descendant = 900004, foreignChild = 900005;
  const pids = new Set([pid, descendant]), effects = [];
  let live = true;
  const child = { exitCode: state === 'reused' ? 0 : null, signalCode: null };
  const cleanup = { verified: false, forcedKill: false, naturalExit: false, liveRemoved: true, errors: [] };
  const report = { lifecycle: [{ event: 'quit', code: 0 }] };
  const instance = { evaluate: async callback => {
    effects.push({ operation: 'inspector-quit-request' });
    if (state !== 'natural') throw new Error('SYNTHETIC inspector already disconnected or unresponsive');
    return callback({ app: { quit() { live = false; child.exitCode = 0; } } });
  } };
  const runFile = async (filename, args) => {
    effects.push({ operation: 'execFile', filename, args: [...args], script: Buffer.from(args.at(-1), 'base64').toString('utf16le') });
    assert.equal(filename, 'powershell.exe', 'no forced termination executable is authorized');
    if (queryError) throw new Error('SYNTHETIC query unavailable');
    const row = { ProcessId: pid, ParentProcessId: state === 'reused' ? 900000 : 900002,
      Name: state === 'reused' ? 'SYNTHETIC-editor.exe' : 'electron.exe',
      ExecutablePath: state === 'reused' ? 'C:/SYNTHETIC/editor.exe' : 'C:/SYNTHETIC/runtime/electron.exe',
      CreationDate: state === 'reused' ? 'SYNTHETIC-new-creation' : 'SYNTHETIC-original-creation' };
    const rows = live ? [state === 'ambiguous' ? { ProcessId: pid } : row] : [];
    if (extraRow) rows.push({ ProcessId: foreignChild, ParentProcessId: pid });
    return { stdout: JSON.stringify(rows) };
  };
  const process = { kill(target, signal) {
    effects.push({ operation: 'signal', pid: target, signal });
    assert.equal(signal, 0, 'only synthetic liveness observations are permitted');
    if (live && target === pid) return true;
    throw Object.assign(new Error('SYNTHETIC dead'), { code: 'ESRCH' });
  } };
  await runInNewContext(`(async () => { ${helpers}\n${toolSource.slice(start, end)}\n${toolSource.slice(naturalStart, naturalEnd)}\n${toolSource.slice(verifiedStart, verifiedEnd)} })()`,
    { assert, process, Buffer, pids, cleanup, report, instance, child, root: 'C:/SYNTHETIC/run', runFile,
      sleep: async () => {}, setTimeout, clearTimeout, setImmediate: callback => callback() }, { timeout: 1000 });
  return { cleanup, effects, pids: [...pids], pid, descendant, foreignChild };
}

// Execute the exact maintained helper against synthetic getter tripwires, not real environment values.
const environmentStart = toolSource.indexOf('function childEnvironment(paths, home) {');
const environmentEnd = toolSource.indexOf('async function createCertificates(', environmentStart);
assert.ok(environmentStart >= 0 && environmentEnd > environmentStart, 'maintained environment helper boundaries are missing');
const environmentHelper = toolSource.slice(environmentStart, environmentEnd).trim();
function isolatedChildEnvironment(env, paths, home) {
  const helper = runInNewContext(`(${environmentHelper})`, { process: { env }, join }, { timeout: 1000 });
  return helper(paths, home);
}

test('test-only child environment never reads excluded environment values', () => {
  const fixture = { Path: 'C:/wmusic-SYNTHETIC-bin', SystemRoot: 'C:/wmusic-SYNTHETIC-Windows' };
  let excludedReads = 0;
  for (const key of ['NPM_TOKEN', 'OPENAI_API_KEY', 'HTTP_PROXY', 'ELECTRON_RUN_AS_NODE', 'NODE_TLS_REJECT_UNAUTHORIZED', 'HOME', 'USERPROFILE', 'APPDATA']) {
    Object.defineProperty(fixture, key, { enumerable: true, get() {
      excludedReads++;
      throw new Error('SYNTHETIC excluded environment getter was read');
    } });
  }
  const paths = { appData: 'C:/wmusic-SYNTHETIC/appData', temp: 'C:/wmusic-SYNTHETIC/temp' };
  let result;
  assert.doesNotThrow(() => { result = isolatedChildEnvironment(fixture, paths, 'C:/wmusic-SYNTHETIC/home'); });
  assert.equal(excludedReads, 0);
  assert.equal(result.Path, fixture.Path);
  assert.equal(result.SystemRoot, fixture.SystemRoot);
  assert.equal(result.HOME, 'C:/wmusic-SYNTHETIC/home');
  assert.equal(result.USERPROFILE, result.HOME);
  assert.equal(result.APPDATA, paths.appData);
  assert.equal(result.TMPDIR, paths.temp);
  for (const key of ['NPM_TOKEN', 'OPENAI_API_KEY', 'HTTP_PROXY', 'ELECTRON_RUN_AS_NODE', 'NODE_TLS_REJECT_UNAUTHORIZED']) assert.equal(Object.hasOwn(result, key), false);
});

test('test-only child environment reads allowed Windows key spellings once', () => {
  const reads = [];
  const fixture = {};
  for (const key of ['PATH', 'SystemRoot', 'ComSpec', 'NUMBER_OF_PROCESSORS']) {
    Object.defineProperty(fixture, key, { enumerable: true, get() { reads.push(key); return `SYNTHETIC-${key}`; } });
  }
  const paths = { appData: 'SYNTHETIC-appData', temp: 'SYNTHETIC-temp' };
  const result = isolatedChildEnvironment(fixture, paths, 'SYNTHETIC-home');
  assert.deepEqual(reads, ['PATH', 'SystemRoot', 'ComSpec', 'NUMBER_OF_PROCESSORS']);
  assert.equal(result.PATH, 'SYNTHETIC-PATH');
  assert.equal(result.ComSpec, 'SYNTHETIC-ComSpec');
  assert.equal(result.LOCALAPPDATA, join('SYNTHETIC-home', 'local'));
});

// Pure synthetic report controls only. No Electron, sockets, profiles or app imports.
const subject = await import('../tools/test-wmusic-network-security.mjs').catch(error => ({ importError: String(error) }));

test('wrong SRI accepted by a runtime remains a SECURITY FAIL', () => {
  assert.equal(typeof subject.assessObservation, 'function', 'maintained observation evaluator is missing');
  const result = subject.assessObservation({ kind: 'sri', valid: false }, {
    fulfilled: true, status: 200, body: 'wmusic synthetic network fixture\n',
  });
  assert.equal(result, false, 'a fulfilled wrong digest must never become an expected-green regression');
});

test('SRI rejects transport errors as proof of digest checking and keeps positive controls', () => {
  assert.equal(subject.assessObservation({ kind: 'sri', valid: false }, {
    fulfilled: false, error: { chain: [{ message: 'connect ECONNREFUSED' }] },
  }), false);
  assert.equal(subject.assessObservation({ kind: 'sri', valid: false }, {
    fulfilled: false, error: { chain: [{ message: 'fetch failed' }, { message: 'integrity mismatch' }] },
  }), true);
  assert.equal(subject.assessObservation({ kind: 'sri', valid: true }, {
    fulfilled: true, status: 200, body: 'wmusic synthetic network fixture\n',
  }), true);
  assert.equal(subject.assessObservation({ kind: 'sri', valid: true }, {
    fulfilled: true, status: 200, body: 'truncated',
  }), false);
});

test('report gate rejects missing observations and malformed reports', () => {
  assert.equal(typeof subject.evaluateReport, 'function', 'fail-closed report gate is missing');
  const incomplete = subject.evaluateReport({ operationSucceeded: true, cases: [] });
  assert.equal(incomplete.securityAccepted, false);
  assert.ok(incomplete.reasons.some(reason => reason.includes('missing')));
  for (const report of [undefined, {}, { operationSucceeded: true, securityAccepted: true }]) {
    assert.equal(subject.evaluateReport(report).securityAccepted, false);
  }
});

function syntheticPassingReport() {
  const specs = subject.requiredCases();
  const error = (message, code) => ({ fulfilled: false, error: { chain: [{ message, code }] } });
  const auth = 'Bearer WMUSIC_SYNTHETIC_AUTH_ONLY', cookie = 'wmusic_synthetic_cookie=only-fixture';
  const ok = { fulfilled: true, status: 200, body: 'wmusic synthetic network fixture\n', wire: [{}] };
  const observation = spec => {
    if (spec.kind === 'sri') return spec.valid ? { ...ok } : error('integrity mismatch');
    if (spec.kind === 'tls') return spec.mode === 'trusted-positive' ? { ...ok }
      : { ...error('certificate rejected', spec.mode === 'untrusted' ? 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' : 'ERR_TLS_CERT_ALTNAME_INVALID'), wire: [] };
    if (spec.kind === 'redirect') {
      const source = { path: spec.mode === 'loop' ? '/loop' : '/redirect', authorization: auth, cookie, origin: 'A' };
      if (spec.mode === 'error') return { ...error('unexpected redirect'), wire: [source] };
      if (spec.mode === 'manual') return { fulfilled: true, status: 302, location: 'fixture', expectedLocation: 'fixture', wire: [source] };
      if (spec.mode === 'loop') return { ...error('redirect count exceeded'), wire: [source, source] };
      return { ...ok, wire: [source, { path: '/echo', origin: spec.mode === 'same-origin-auth' ? 'A' : 'B',
        authorization: spec.mode === 'same-origin-auth' ? auth : null, cookie: spec.mode === 'same-origin-auth' ? cookie : null }] };
    }
    if (spec.kind === 'proxy') return { ...ok, proxyConnectDelta: spec.mode === 'explicit-proxy' ? 1 : 0 };
    if (spec.kind === 'body-cleanup') return { ...error('aborted', 'AbortError'), prefixRead: true,
      serverStreamClosed: true, readerCancelled: true, wire: [{}] };
    return spec.mode === 'untrusted-tls' ? { ...error('net::ERR_CERT_AUTHORITY_INVALID'), wire: [] }
      : { ...ok, nodeProcessType: 'undefined' };
  };
  return { syntheticPureControl: true, operationSucceeded: true, diagnostics: [], exclusions: [],
    containment: { verified: true }, provenance: { verified: true }, unchanged: { verified: true },
    runtimeCleanup: { verified: true }, cleanup: { verified: true, naturalExit: true, forcedKill: false },
    cases: specs.map(spec => ({ id: spec.id, executed: true, observation: observation(spec) })) };
}

test('complete synthetic reports pass; no result boolean overrides raw vulnerability observations', () => {
  const control = syntheticPassingReport();
  assert.equal(subject.evaluateReport(control).securityAccepted, true);
  const vulnerable = structuredClone(control);
  vulnerable.cases.find(row => row.id === 'builtin/before-global-dispatcher/sri/wrong-tab').observation = {
    fulfilled: true, status: 200, body: 'wmusic synthetic network fixture\n',
  };
  vulnerable.securityAccepted = true;
  for (const row of vulnerable.cases) row.securityAccepted = true;
  assert.equal(subject.evaluateReport(vulnerable).securityAccepted, false);
});

test('diagnostics, duplicates, omissions, forced kill, malformed errors and missing execution fail closed', () => {
  const mutations = [
    report => report.diagnostics.push({ message: 'unexpected native diagnostic sentinel' }),
    report => report.cases.push(structuredClone(report.cases[0])),
    report => report.cases.push({ id: 'unexpected-case', executed: true, observation: {} }),
    report => report.cases.pop(),
    report => { report.cleanup.forcedKill = true; },
    report => { report.cleanup.naturalExit = false; },
    report => { report.containment.verified = false; },
    report => { report.cases[0].executed = false; },
    report => { report.cases[1].observation = { fulfilled: false, error: { chain: 'malformed' } }; },
  ];
  for (const mutate of mutations) {
    const report = syntheticPassingReport(); mutate(report);
    assert.equal(subject.evaluateReport(report).securityAccepted, false);
  }
});

test('only the exact owned inspector disconnect line is classified; arbitrary diagnostics still reject', () => {
  assert.equal(typeof subject.classifyNativeOutput, 'function', 'native output classifier is missing');
  const report = syntheticPassingReport();
  report.inspector = { pid: 42, type: 'browser' };
  subject.classifyNativeOutput(report, '', 'Waiting for the debugger to disconnect...\n');
  assert.equal(report.diagnostics.length, 0);
  assert.equal(subject.evaluateReport(report).securityAccepted, true);
  subject.classifyNativeOutput(report, '', 'Waiting for the debugger to disconnect... unexpected\n');
  assert.equal(subject.evaluateReport(report).securityAccepted, false);
  const failedShutdown = syntheticPassingReport(); failedShutdown.cleanup.naturalExit = false;
  failedShutdown.inspector = { pid: 42, type: 'browser' };
  subject.classifyNativeOutput(failedShutdown, '', 'Waiting for the debugger to disconnect...\n');
  assert.equal(failedShutdown.diagnostics.length, 1);
});

test('R1 full launcher prelaunch failure without a reader performs no process lookup or signal', async () => {
  const result = await launcherModel();
  assert.equal(result.exitCode, 1);
  assert.equal(result.report.cleanup.naturalExit, false);
  assert.deepEqual(result.effects.filter(row => row.operation === 'execFile' || row.operation === 'signal'), []);
});

test('R1 known owned inspector handle can quit naturally with tracked descendants retained', async () => {
  const result = await cleanupModel();
  assert.equal(result.cleanup.naturalExit, true);
  assert.equal(result.cleanup.verified, true);
  assert.equal(result.cleanup.forcedKill, false);
  assert.deepEqual(result.pids, [result.pid, result.descendant]);
  assert.equal(result.effects.filter(row => row.operation === 'inspector-quit-request').length, 1);
  assert.ok(result.cleanup.pids.every(row => row.alive === false));
});

for (const state of ['reused', 'ambiguous', 'known-owned-survivor']) {
  test(`R1 ${state} PID cannot authorize termination or a passing cleanup`, async () => {
    const result = await cleanupModel({ state });
    assert.equal(result.cleanup.forcedKill, false);
    assert.equal(result.cleanup.naturalExit, false);
    assert.equal(result.cleanup.verified, false);
    assert.ok(result.cleanup.errors.some(row => row.operation === 'process-cleanup-refused'));
    assert.deepEqual(result.pids, [result.pid, result.descendant], 'queries must not promote PIDs into resource ownership');
    assert.ok(result.effects.every(row => row.operation !== 'signal' || row.signal === 0));
    for (const row of result.effects.filter(row => row.operation === 'execFile')) {
      assert.equal(row.filename, 'powershell.exe');
      assert.match(row.script, new RegExp(`-Filter 'ProcessId = ${result.pid} OR ProcessId = ${result.descendant}'`));
      assert.equal(row.script.includes('CommandLine'), false, 'reader substrings are not process ownership');
      assert.equal(row.script.includes(String(result.foreignChild)), false, 'no descendant tree kill/query authority is inferred');
    }
    const report = syntheticPassingReport(); report.cleanup = result.cleanup;
    assert.equal(subject.evaluateReport(report).securityAccepted, false);
  });
}

test('R1 query failures and unexpected PID rows remain cleanup failures without signals', async () => {
  for (const options of [{ queryError: true }, { extraRow: true }]) {
    const result = await cleanupModel(options);
    assert.equal(result.cleanup.verified, false);
    assert.ok(result.cleanup.errors.some(row => row.operation.includes('process-query')));
    assert.deepEqual(result.pids, [result.pid, result.descendant]);
    assert.ok(result.effects.every(row => row.operation !== 'signal' || row.signal === 0));
  }
});

test('auth leakage, accepted invalid TLS, proxy bypass drift, open streams and malformed wire records reject', () => {
  const mutations = [
    report => { report.cases.find(row => row.id === 'builtin/redirect/cross-origin-auth').observation.wire[1].authorization = 'leaked synthetic token'; },
    report => { report.cases.find(row => row.id === 'external/tls/hostname-mismatch').observation = { fulfilled: true, status: 200, body: 'wmusic synthetic network fixture\n', wire: [{}] }; },
    report => { report.cases.find(row => row.id === 'builtin/proxy/explicit-no-proxy').observation.proxyConnectDelta = 1; },
    report => { report.cases.find(row => row.id === 'external/cleanup/body-cancel').observation.serverStreamClosed = false; },
    report => { report.cases.find(row => row.id === 'builtin/redirect/manual').observation.wire = 'malformed'; },
    report => { report.cases.find(row => row.id === 'external/redirect/cross-origin-auth').observation.wire = [null]; },
  ];
  for (const mutate of mutations) {
    const report = syntheticPassingReport(); mutate(report);
    assert.equal(subject.evaluateReport(report).securityAccepted, false);
  }
});

function assertRevokedUnchanged(result, before = 'stdout.log') {
  const detection = result.effects.findIndex(row => row.revalidationFailure);
  assert.ok(detection >= 0, 'the complete launcher must reach the injected final root validation');
  const previous = result.effects.slice(0, detection), after = result.effects.slice(detection + 1);
  assert.equal(result.summary.operationSucceeded, true, 'the synthetic native matrix completed, not a preflight/import/model error');
  assert.equal(previous.filter(row => row.operation === 'readdir' && row.target === join(result.repo, 'src')).length, 2,
    'both nonempty baseline and final governed inventories completed before the fault');
  assert.equal(previous.filter(row => row.operation === 'readdir' && row.target === join(result.repo, 'out')).length, 2);
  const writes = previous.filter(row => row.operation === 'writeFile').map(row => row.target);
  const hasWrite = name => writes.some(path => path.endsWith(join('evidence', name)));
  assert.equal(hasWrite('governed-after.json'), before !== 'governed-after.json');
  assert.equal(hasWrite('stdout.log'), ['stderr.log', 'report.json'].includes(before));
  assert.equal(hasWrite('stderr.log'), before === 'report.json');
  assert.deepEqual(after.filter(row => ['realpath', 'lstat', 'readdir', 'readStream', 'readFile', 'stat', 'mkdir', 'mkdtemp', 'writeFile', 'rm'].includes(row.operation)), [],
    'unsafe latch must prevent ALL later filesystem effects, including another realpath after one-shot recovery');
  assert.equal(result.report, null);
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.securityAccepted, false);
  assert.equal(result.summary.cleanup.verified, false);
  assert.equal(result.summary.cleanup.naturalExit, true, 'late validation failure must not rewrite the observed natural shutdown');
  assert.equal(result.summary.cleanup.forcedKill, false);
  assert.equal(result.summary.cleanup.launcherExitCode, 0);
  assert.ok(result.summary.cleanup.pids.every(row => row.alive === false));
  assert.ok(previous.some(row => row.operation === 'inspector-graceful-quit-request'));
  assert.ok(previous.some(row => row.operation === 'mock-app-quit'));
  assert.equal(result.summary.unchanged.beforeSha256, result.summary.unchanged.afterSha256, 'keep the previously collected hashes');
  assert.match(result.summary.unchanged.afterSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.summary.unchanged.verified, false,
    'R2-UNCHANGED-STALE: final current unchanged certification must be revoked after root validation fails');
  assert.equal(result.summary.unchanged.invalidated, true);
  assert.match(result.summary.unchanged.inventorySnapshot, /historical/i, 'retained hashes are explicitly historical, never current certification');
  assert.ok(result.summary.acceptance.reasons.includes('unchanged not verified'));
}

test('R2-UNCHANGED final summary revokes repo drift certification after governed-after write', async () => {
  assertRevokedUnchanged(await launcherModel({ complete: true, protectedFailureRoot: 'repo' }));
});

// Added after the core RED→GREEN: fix-dependent variants, not independent test-first REDs.
for (const protectedFailureRoot of ['repo', 'runtime']) {
  for (const protectedFailureMode of ['drift', 'error', 'recovering-error']) {
    for (const protectedFailureBefore of ['governed-after.json', 'stdout.log', 'stderr.log', 'report.json']) {
      if (protectedFailureRoot === 'repo' && protectedFailureMode === 'drift' && protectedFailureBefore === 'stdout.log') continue;
      test(`R2-UNCHANGED ${protectedFailureRoot} ${protectedFailureMode} revokes final certification before ${protectedFailureBefore}`, async () => {
        assertRevokedUnchanged(await launcherModel({ complete: true, protectedFailureRoot, protectedFailureMode, protectedFailureBefore }), protectedFailureBefore);
      });
    }
  }
}

test('R2-UNCHANGED-CONTROL complete stable launcher keeps current unchanged true', async () => {
  const result = await launcherModel({ complete: true });
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.operationSucceeded, true);
  assert.equal(result.summary.securityAccepted, true);
  assert.equal(result.report.unchanged.verified, true);
  assert.equal(result.report.unchanged.invalidated, undefined);
  assert.equal(result.report.unchanged.inventorySnapshot, undefined);
  assert.equal(result.report.unchanged.beforeSha256, result.report.unchanged.afterSha256);
  assert.equal(result.report.unchanged.sourceFiles, 1);
  assert.equal(result.report.unchanged.outputFiles, 1);
  assert.equal(result.report.cleanup.naturalExit, true);
  assert.equal(result.report.cleanup.forcedKill, false);
  assert.equal(result.report.cleanup.verified, true);
  assert.ok(result.effects.some(row => row.operation === 'writeFile' && row.target.endsWith(join('evidence', 'governed-after.json'))));
});

test('R2-UNCHANGED-CONTROL earlier unsafe latch retains independent inspector quit without certifying natural exit', async () => {
  const result = await launcherModel({ complete: true, protectedFailureRoot: 'repo', protectedFailureBefore: 'retained-finally' });
  assertUnsafeFailstop(result);
  const detection = result.effects.findIndex(row => row.revalidationFailure);
  assert.ok(result.effects.slice(detection + 1).some(row => row.operation === 'inspector-graceful-quit-request'));
  assert.ok(result.effects.slice(detection + 1).some(row => row.operation === 'mock-app-quit'));
  assert.equal(result.summary.operationSucceeded, true);
  assert.equal(result.summary.cleanup.launcherExitCode, 0);
  assert.equal(result.summary.cleanup.nativeQuitCode, null, 'unsafe paths cannot be read to manufacture lifecycle evidence');
  assert.equal(result.summary.cleanup.naturalExit, false);
  assert.equal(result.summary.cleanup.forcedKill, false);
  assert.ok(result.summary.cleanup.pids.every(row => row.alive === false));
});
