// Read-only NSIS inspection. Never executes the installer; runtime acceptance is separate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import { Resource } from 'resedit';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const supplied = process.argv[2];
if (!supplied || !supplied.endsWith('.exe')) throw new Error('Pass the Windows installer EXE path.');
const artifact = resolve(supplied);
if (/portable/i.test(basename(artifact))) throw new Error('The single-file portable build has been retired; pass the NSIS installer instead.');
const root = await mkdtemp(join(tmpdir(), 'huawei-installer-inspect-'));
const sevenZip = await getPath7za();
const forbidden = /^(\.local|research|docs|test|tools|scripts|src|design-previews|\.git)(\/|$)/;

// Minimal ICO + PNG reader so the packaged icon can be checked as artwork, not just as a file.
function readIcoEntries(ico) {
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const start = ico.readUInt32LE(offset + 12);
    const bytes = ico.readUInt32LE(offset + 8);
    return { width: ico[offset] === 0 ? 256 : ico[offset], png: ico.subarray(start, start + 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), data: ico.subarray(start, start + bytes) };
  });
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function walkFiles(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(full, base));
    else files.push(relative(base, full).replaceAll('\\', '/'));
  }
  return files;
}
async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}
function extract(archive, destination) {
  // Keep 7-Zip's output so a platform-specific failure is diagnosable from the CI log.
  return execFileSync(sevenZip, ['x', '-y', `-o${destination}`, archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}
// 7-Zip's -slt listing layout differs between platforms, so locate the embedded payload by
// unpacking the wrapper instead of parsing its file table.
async function findEmbeddedPayload(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findEmbeddedPayload(full));
    else if (/\.(7z|zip)$/i.test(entry.name)) found.push(full);
  }
  return found;
}
function peHeader(bytes) {
  assert.equal(bytes.subarray(0, 2).toString(), 'MZ');
  const offset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.readUInt32LE(offset), 0x4550, 'invalid PE header');
  const magic = bytes.readUInt16LE(offset + 24);
  assert.ok(magic === 0x10b || magic === 0x20b);
  const certificateDirectory = offset + 24 + (magic === 0x20b ? 112 : 96) + 4 * 8;
  return { machine: bytes.readUInt16LE(offset + 4), signed: bytes.readUInt32LE(certificateDirectory) !== 0 };
}
try {
  // 7-Zip flattens this NSIS payload on Windows while Linux keeps $PLUGINSDIR/app-64.7z,
  // so locate the application files whichever layout the extractor produced.
  const outerLog = extract(artifact, join(root, 'wrapper'));
  const wrapperListing = await readdir(join(root, 'wrapper'));
  let appRoot = join(root, 'wrapper');
  if (!(await exists(join(appRoot, 'resources', 'app.asar')))) {
    const embeddedFiles = await findEmbeddedPayload(appRoot);
    assert.equal(embeddedFiles.length, 1,
      `expected exactly one embedded payload, got ${JSON.stringify(embeddedFiles)}; wrapper=${JSON.stringify(wrapperListing.slice(0, 20))}; 7z=${outerLog.slice(-300)}`);
    const embedded = embeddedFiles[0];
    assert.match(basename(embedded), /^app-64\.(7z|zip)$/i, `embedded payload is not the x64 application: ${basename(embedded)}`);
    extract(embedded, join(root, 'app'));
    appRoot = join(root, 'app');
  }
  const payload = await walkFiles(appRoot);
  // An installer normally carries its uninstaller alongside the application.
  assert.ok(payload.length > 10, 'installer payload looks empty');
  // The executable name follows build.productName, so discover it instead of hardcoding it.
  const appExe = payload.find(path => !path.includes('/') && /\.exe$/i.test(path));
  assert.ok(appExe, `no top-level application executable in payload: ${JSON.stringify(payload.slice(0, 5))}`);
  assert.ok(payload.includes('resources/app.asar'));
  assert.deepEqual(payload.filter(path => /(^|\/)(session\.enc|session\.json|settings\.json|queue\.json|cache\.json|history\.json)$/.test(path)), [], 'user data inside the installer');
  const archive = join(appRoot, 'resources', 'app.asar');
  const unpackedArchive = join(dirname(artifact), 'win-unpacked', 'resources', 'app.asar');
  assert.equal(hash(await readFile(archive)), hash(await readFile(unpackedArchive)), 'embedded app differs from the unpacked build');
  // Unpack the asar and compare real files: entry-name separators and leading slashes differ
  // between platforms, and @electron/asar lookups are sensitive to that.
  const unpackedAsar = join(root, 'asar');
  asar.extractAll(archive, unpackedAsar);
  const entries = await walkFiles(unpackedAsar);
  assert.deepEqual(entries.filter(path => forbidden.test(path)), [], 'private or project-source paths in app.asar');
  if (entries.includes('node_modules/electron-updater/package.json')) assert.ok(entries.includes('node_modules/debug/src/index.js'), 'updater runtime entry must not be removed as project source');
  for (const required of ['out/main/index.js', 'out/preload/index.cjs', 'out/renderer/index.html', 'package.json']) {
    assert.ok(entries.includes(required), `app.asar is missing ${required}`);
  }
  for (const entry of entries.filter(path => path.startsWith('out/'))) {
    assert.equal(hash(await readFile(join(unpackedAsar, entry))), hash(await readFile(entry)), `outdated bundled output: ${entry}`);
  }
  const appBytes = await readFile(join(appRoot, appExe));
  const appPe = peHeader(appBytes);
  const outerBytes = await readFile(artifact);
  const wrapperPe = peHeader(outerBytes);
  // NSIS stubs are 32-bit launchers even for x64 payloads; identify the installer by its marker.
  assert.ok(outerBytes.includes(Buffer.from('Nullsoft')) || outerBytes.includes(Buffer.from('NSIS Error')),
    'installer wrapper is not a Nullsoft (NSIS) package');
  assert.equal(appPe.machine, 0x8664, 'application is not Windows x64');
  const ico = readIcoEntries(await readFile(resolve('build', 'icon.ico')));
  assert.deepEqual(ico.map(entry => entry.width).sort((a, b) => a - b), [16, 24, 32, 48, 64, 128, 256]);
  assert.ok(ico.every(entry => entry.png), 'all approved source ICO frames must be PNG');
  // Inspect the actual executable, not electron-builder's intermediate or a source-only PNG.
  const resources = NtExecutableResource.from(NtExecutable.from(appBytes));
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const sourceFrames = new Map(ico.map(entry => [entry.width, hash(entry.data)]));
  const matching = groups.find(group => group.icons.length === ico.length && new Set(group.icons.map(icon => icon.width || 256)).size === ico.length && group.icons.every(icon => {
    const entry = resources.entries.find(item => item.type === 3 && item.id === icon.iconID && item.lang === group.lang);
    return entry && hash(Buffer.from(entry.bin)) === sourceFrames.get(icon.width || 256);
  }));
  assert.ok(matching, 'no EXE icon group matches every approved source ICO frame byte-for-byte');
  const packageConfig = JSON.parse(await readFile('package.json', 'utf8'));
  const versionTables = Resource.VersionInfo.fromEntries(resources.entries)
    .flatMap(info => info.getAllLanguagesForStringValues().map(lang => info.getStringValues(lang)));
  assert.ok(versionTables.some(info => info.ProductName === packageConfig.build.productName
    && info.FileDescription === packageConfig.build.productName && info.FileVersion === packageConfig.version),
    'the executable product name/version resources must match the current Wmusic build');
  for (const required of ['LICENSE', 'NOTICE']) {
    assert.ok(entries.includes(required), `missing ${required}`);
    assert.equal(hash(await readFile(join(unpackedAsar, required))), hash(await readFile(required)), `stale ${required}`);
  }
  const expectedOutputs = (await walkFiles(resolve('out'))).map(path => `out/${path}`).sort();
  assert.deepEqual(entries.filter(path => path.startsWith('out/')).sort(), expectedOutputs, 'packaged output inventory differs');
  const iconBinding = { groupId: matching.id, lang: matching.lang, matchedFrames: matching.icons.length, sha256: hash(await readFile('build/icon.ico')) };
  assert.equal(appPe.signed, false, 'expected an explicitly unsigned internal build');
  assert.equal(wrapperPe.signed, false);
  assert.ok(appBytes.includes(Buffer.from('asInvoker')), 'application execution manifest must not request elevation');
  console.log(JSON.stringify({ artifact: basename(artifact), kind: 'nsis-installer', applicationExecutable: appExe, bytes: (await stat(artifact)).size,
    sha256: hash(outerBytes), installerWithEmbeddedApp: true, appArchitecture: 'x64',
    wrapperArchitecture: wrapperPe.machine === 0x14c ? 'x86 NSIS launcher (starts x64 app)' : 'other',
    unsigned: true, noPrivateDataOrSources: true, matchesCurrentBuild: true,
    iconSizes: ico.map(entry => entry.width).sort((a, b) => a - b), iconArtworkVerified: true, iconBinding,
    windowsRuntimeTested: false, installAndLaunch: 'not-tested' }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
