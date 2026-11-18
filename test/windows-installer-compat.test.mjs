import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { win32 } from 'node:path';
import { test } from 'node:test';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const vendor = name => readFileSync(require.resolve(`app-builder-lib/templates/nsis/${name}`), 'utf8');
const config = JSON.parse(read('package.json')).build;
const assisted = vendor('assistedInstaller.nsh');
const multiUser = vendor('multiUser.nsh');
const include = config.nsis.include ? read(config.nsis.include) : '';
const body = (source, kind, name) => source.match(new RegExp(`^\\s*${kind} ${name}(?:[ \\t]+[^\\r\\n]*)?\\r?\\n([\\s\\S]*?)^\\s*(?:FunctionEnd|!macroend)\\b`, 'm'))?.[1];
const lines = source => source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^[#;]/.test(line));
const stock = body(assisted, 'Function', 'instFilesPre');
const stockCallback = assisted.match(/!define MUI_PAGE_CUSTOMFUNCTION_PRE (\w+)/)?.[1];
const hook = body(include, '!macro', 'customPageAfterChangeDir');
const callback = hook ? hook.match(/!define MUI_PAGE_CUSTOMFUNCTION_PRE (\w+)/)?.[1] : stockCallback;
const fold = value => value.toLowerCase();
const sha = text => createHash('sha256').update(text).digest('hex');

// Execute only the small callback instruction subset. External inputs (registry,
// directory state, and Win32 lexical path normalization) are modeled in memory.
// Unknown instructions fail; no installer, native API, filesystem or registry is
// used by the evaluator. The separate makensis check verifies actual expansion.
function run({ hive, recorded, selected, silent = false, updated = false }) {
  const vars = { '$INSTDIR': selected ?? (recorded[hive] || String.raw`C:\Install Root\Wmusic`), '$0': 'scratch0', '$1': 'scratch1', '$2': 'scratch2' };
  const stack = [];
  const visited = [];
  const expand = text => text.replace(/\$INSTDIR|\$[012]|\$\{APP_FILENAME\}/g, key => key === '${APP_FILENAME}' ? config.productName : vars[key]);
  const execute = name => {
    visited.push(name);
    const source = name === stockCallback ? stock : body(include, 'Function', name);
    assert.ok(source, `missing callback ${name}`);
    const code = lines(source).filter(line => !/^!(?:define \/math WMUSIC_COMPAT_PATH_LIMIT |undef WMUSIC_COMPAT_PATH_LIMIT$)/.test(line)).flatMap(line => {
      const invoke = line.match(/^!insertmacro WmusicCompatCanonicalize (\$[01]) (r[01])$/);
      if (!invoke) return line;
      const [, path, reg] = invoke;
      return lines(body(include, '!macro', 'WmusicCompatCanonicalize')).map(expanded => expanded
        .replaceAll('${path}', path).replaceAll('${reg}', reg));
    });
    const labels = new Map(code.flatMap((line, i) => line.endsWith(':') ? [[line.slice(0, -1), i]] : []));
    const branch = target => {
      if (!target || target === '0') return 0;
      assert.ok(labels.has(target), `missing label ${target}`);
      return labels.get(target);
    };
    for (let i = 0, budget = 100; i < code.length; i++) {
      assert.ok(--budget, `callback did not terminate: ${name}`);
      const [op, ...args] = [...code[i].matchAll(/"([^"]*)"|(\S+)/g)].map(m => m[1] ?? m[2]);
      const [a, b, c, d, e] = args;
      if (op.endsWith(':')) continue;
      switch (op) {
        case 'Push': stack.push(expand(a)); break;
        case 'Pop': assert.ok(stack.length); vars[a] = stack.pop(); break;
        case 'ClearErrors': break;
        case 'ReadRegStr':
          assert.deepEqual(args.slice(1), ['SHELL_CONTEXT', '${INSTALL_REGISTRY_KEY}', 'InstallLocation']);
          vars[a] = recorded[hive] ?? '';
          break;
        case 'StrCmp':
        case 'StrCmpS': {
          const compare = op === 'StrCmp' ? fold : value => value;
          const next = branch(compare(expand(a)) === compare(expand(b)) ? c : d);
          if (next) i = next;
          break;
        }
        case 'StrLen': vars[a] = String(expand(b).length); break;
        case 'IntCmp': {
          const limit = { '${WMUSIC_COMPAT_PATH_LIMIT}': 8192 - 2, '${NSIS_MAX_STRLEN}': 8192, '0': 0, '2': 2 }[b];
          assert.notEqual(limit, undefined, `unmodeled limit: ${b}`);
          const actual = Number(expand(a));
          const next = branch(actual === limit ? c : actual < limit ? d : e); if (next) i = next;
          break;
        }
        case 'System::Call': {
          if (code[i] === "System::Call 'kernel32::CompareStringOrdinal(w r0, i -1, w r1, i -1, i 1) i .r2'") {
            vars.$2 = fold(vars.$0) === fold(vars.$1) ? '2' : '1';
            break;
          }
          const call = code[i].match(/^System::Call 'kernel32::GetFullPathNameW\(w r([01]), i \$\{NSIS_MAX_STRLEN\}, w \.r\1, p 0\) i \.r2'$/);
          assert.ok(call, `unmodeled System call: ${code[i]}`);
          const key = `$${call[1]}`;
          assert.ok(win32.isAbsolute(vars[key]));
          const normalized = win32.normalize(vars[key]);
          vars[key] = normalized.length < 8192 ? normalized : '';
          vars.$2 = String(normalized.length < 8192 ? normalized.length : normalized.length + 1);
          break;
        }
        case 'StrCpy': {
          const value = expand(b);
          const offset = Number(d ?? 0);
          const start = offset < 0 ? value.length + offset : offset;
          vars[a] = c ? value.slice(start, start + Number(c)) : value.slice(start);
          break;
        }
        case 'Goto': i = branch(a); break;
        case 'Call': assert.equal(a, stockCallback); execute(a); break;
        case 'Return': return;
        case '${StrContains}': vars[a] = fold(expand(c)).includes(fold(expand(b))) ? expand(b) : ''; break;
        case '${If}':
          assert.equal(b, '==');
          if (fold(expand(a)) !== fold(expand(c))) {
            i = code.indexOf('${endIf}', i + 1);
            assert.notEqual(i, -1);
          }
          break;
        case '${endIf}': break;
        default: assert.fail(`unmodeled instruction: ${code[i]}`);
      }
    }
  };
  // NSIS silent mode does not create pages. In the locked assisted script,
  // --updated skips the Directory page, not the InstFiles callback.
  if (!silent) execute(callback);
  assert.deepEqual(stack, []);
  assert.equal(vars.$1, 'scratch1');
  assert.equal(vars.$2, 'scratch2');
  return { directory: vars.$INSTDIR, stockRan: visited.includes(stockCallback), directoryPage: !silent && !updated };
}

test('locked assisted installer changes only the InstFiles pre-callback seam', () => {
  assert.equal(require('app-builder-lib/package.json').version, '26.15.3');
  assert.equal(sha(assisted), '8aa1230e9717b428664d613fcc5c6a060883410b34cb7853b517fe11b4ee0a76');
  assert.match(vendor('include/StrContains.nsh'), /StrCmp \$STR_CONTAINS_VAR_3 \$STR_NEEDLE found/);
  assert.equal(config.nsis.oneClick, false);
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(config.productName, 'Wmusic');
  assert.match(assisted, /!insertmacro skipPageIfUpdated\s*!insertmacro MUI_PAGE_DIRECTORY[\s\S]*!define MUI_PAGE_CUSTOMFUNCTION_PRE instFilesPre[\s\S]*!insertmacro customPageAfterChangeDir\s*!endif\s*!insertmacro MUI_PAGE_INSTFILES/);
  for (const [macro, context, hive] of [['setInstallModePerUser', 'current', 'HKCU'], ['setInstallModePerAllUsers', 'all', 'HKLM']]) {
    assert.match(body(multiUser, '!macro', macro), new RegExp(`SetShellVarContext ${context}[\\s\\S]*ReadRegStr (\\$\\w+) ${hive} "\\$\\{INSTALL_REGISTRY_KEY\\}" InstallLocation[\\s\\S]*StrCpy \\$INSTDIR \\1`));
  }
  if (hook) {
    assert.deepEqual(lines(hook.split(/^Function /m)[0]), ['!undef MUI_PAGE_CUSTOMFUNCTION_PRE', `!define MUI_PAGE_CUSTOMFUNCTION_PRE ${callback}`]);
    assert.notEqual(callback, stockCallback);
  }
});

const oldDefault = String.raw`C:\Users\Fixture\AppData\Local\Programs\huawei-music-desktop`;
const oldCustom = String.raw`D:\音乐工具\Personal Player`;
for (const [kind, old] of [['legacy default', oldDefault], ['custom', oldCustom]]) {
  for (const hive of ['HKCU', 'HKLM']) {
    for (const updated of [false, true]) {
      test(`keeps the ${kind} installation in ${hive} (${updated ? '--updated' : 'ordinary assisted'})`, () => {
        assert.deepEqual(run({ hive, recorded: { [hive]: old }, updated }), { directory: old, stockRan: false, directoryPage: !updated });
      });
    }
  }
}

for (const suffix of ['\\', '\\.', '']) {
  test(`keeps an equivalent selection without rewriting its spelling (${JSON.stringify(suffix)})`, () => {
    const selected = oldCustom.toUpperCase() + suffix;
    assert.equal(run({ hive: 'HKLM', recorded: { HKLM: oldCustom }, selected }).directory, selected);
  });
}

test('keeps an equivalent UNC selection', () => {
  const registered = String.raw`\\fixture-server\programs\Player`;
  const selected = registered + '\\';
  assert.equal(run({ hive: 'HKCU', recorded: { HKCU: registered }, selected }).directory, selected);
});

const samePrefix = oldCustom + '-2';
const otherDrive = 'E' + oldCustom.slice(1);
const conflict = String.raw`D:\Another User\Player`;
for (const [title, recorded, selected, directory] of [
  ['clean default', {}, undefined, String.raw`C:\Install Root\Wmusic`],
  ['clean custom base', {}, conflict, `${conflict}\\Wmusic`],
  ['different explicit sibling', { HKCU: oldCustom }, samePrefix, `${samePrefix}\\Wmusic`],
  ['different explicit drive', { HKCU: oldCustom }, otherDrive, `${otherDrive}\\Wmusic`],
  ['different explicit child', { HKCU: oldCustom }, `${oldCustom}\\New`, `${oldCustom}\\New\\Wmusic`],
  ['different UNC share', { HKCU: String.raw`\\server\first\Player` }, String.raw`\\server\second\Player`, String.raw`\\server\second\Player\Wmusic`],
  ['drive-relative spelling', { HKCU: oldCustom }, 'D:Personal Player', 'D:Personal Player\\Wmusic'],
  ['device namespace is not treated as a DOS alias', { HKCU: oldCustom }, `\\\\?\\${oldCustom}`, `\\\\?\\${oldCustom}\\Wmusic`],
  ['different spelling with an ignorable Unicode character', { HKCU: oldCustom }, oldCustom + '\u00ad', `${oldCustom}\u00ad\\Wmusic`],
  ['explicit /D in --updated', { HKCU: oldCustom }, conflict, `${conflict}\\Wmusic`],
  ['empty current registration / other hive match', { HKCU: '', HKLM: conflict }, conflict, `${conflict}\\Wmusic`],
  ['other hive alone cannot keep the selected path', { HKLM: conflict }, conflict, `${conflict}\\Wmusic`],
]) {
  test(`${title} uses the stock callback`, () => {
    const result = run({ hive: 'HKCU', recorded, selected, updated: title.includes('--updated') });
    assert.equal(result.directory, directory);
    assert.equal(result.stockRan, true);
  });
}

test('silent mode does not enter either page callback', () => {
  for (const [hive, old] of [['HKCU', oldDefault], ['HKLM', oldCustom]]) {
    for (const updated of [false, true]) {
      assert.deepEqual(run({ hive, recorded: { [hive]: old }, silent: true, updated }), { directory: old, stockRan: false, directoryPage: false });
    }
  }
});
