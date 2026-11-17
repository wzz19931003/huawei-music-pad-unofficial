import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const approvedSha256 = '7c10ba746eeee45dda2b33f3d792ba1eb32af7a27c3c69861a55eb4205b13f00';

test('Wmusic icon source is the user-approved 05 shape with 03 colors', async () => {
  const source = await readFile(new URL('../build/icon-src.png', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), approvedSha256,
    'the production generator must use the approved AI-edited image, not an earlier logo');
  assert.equal(source.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(source.readUInt32BE(16), 1254);
  assert.equal(source.readUInt32BE(20), 1254);
});

test('icon preparation removes only edge-connected matte and keeps ivory inside the mark', async () => {
  const moduleUrl = new URL('../scripts/icon-preparation.mjs', import.meta.url);
  const helper = await import(moduleUrl.href).catch(() => ({}));
  assert.equal(typeof helper.prepareIconBitmap, 'function', 'the generator needs a tested transparent-matte preparation step');
  const pixels = Buffer.alloc(7 * 7 * 4);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const color = x >= 1 && x <= 5 && y >= 1 && y <= 5 ? [60, 18, 170, 255] : [235, 245, 250, 255];
    pixels.set(color, (y * 7 + x) * 4);
  }
  pixels.set([222, 245, 253, 255], (3 * 7 + 3) * 4);
  // A rounded-corner pixel belongs to the outer matte, unlike the enclosed white mark.
  pixels.set([235, 245, 250, 255], (1 * 7 + 1) * 4);
  const original = Buffer.from(pixels);
  const result = helper.prepareIconBitmap(pixels, 7, 7);
  assert.deepEqual([result.width, result.height], [5, 5]);
  assert.equal(result.bitmap[3], 0, 'the rounded outer corner must be transparent');
  assert.deepEqual([...result.bitmap.subarray((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)], [222, 245, 253, 255], 'interior warm ivory must survive');
  assert.deepEqual(pixels, original, 'preparing a derived icon must not mutate the approved source pixels');
});

test('icon preparation removes the pale antialias fringe on presentation-sized inputs', async () => {
  const { prepareIconBitmap } = await import(new URL('../scripts/icon-preparation.mjs', import.meta.url));
  const side = 512;
  const pixels = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const inside = x >= 32 && x < side - 32 && y >= 32 && y < side - 32;
    const fringe = inside && (x === 32 || y === 32 || x === side - 33 || y === side - 33);
    const color = fringe ? [190, 175, 212, 255] : inside ? [70, 20, 180, 255] : [235, 245, 250, 255];
    pixels.set(color, (y * side + x) * 4);
  }
  const result = prepareIconBitmap(pixels, side, side);
  assert.deepEqual([...result.bitmap.subarray(0, 4)], [70, 20, 180, 255], 'an ivory-matted fringe must not become a bright outline on a dark taskbar');
});

test('the real Electron icon generator applies the tested transparent preparation', async () => {
  const source = await readFile(new URL('../scripts/make-icon.mjs', import.meta.url), 'utf8');
  assert.match(source, /prepareIconBitmap\(source\.toBitmap\(\),/,
    'all generated sizes must use the prepared icon, not the ivory presentation canvas');
  assert.match(source, /nativeImage\.createFromBitmap\(prepared\.bitmap/);
});

test('the window icon is embedded at 512px and does not depend on unpackaged build paths', async () => {
  const generated = await readFile(new URL('../src/main/icons.ts', import.meta.url), 'utf8');
  const encoded = generated.match(/^export const APP_ICON_PNG_BASE64 = '([^']+)';/m)?.[1];
  assert.ok(encoded, 'the application icon must be embedded just like the tray icon');
  assert.deepEqual(Buffer.from(encoded, 'base64'), await readFile(new URL('../build/icon.png', import.meta.url)));
  const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8');
  assert.match(main, /icon: nativeImage\.createFromDataURL\(`data:image\/png;base64,\$\{APP_ICON_PNG_BASE64\}`\)/);
  assert.ok(!main.includes("icon: join(__dirname, '../../build/icon.png')"), 'build assets are not in the packaged ASAR');
});

test('the HTML fallback title uses the same Wmusic nonofficial identity', async () => {
  const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
  const { APP_DISPLAY_NAME } = await import('../src/shared/app-name.mjs');
  assert.equal(html.match(/<title>([^<]+)<\/title>/)?.[1], APP_DISPLAY_NAME);
});

test('Wmusic installer branding preserves technical identity and the authorized update source', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.build.productName, 'Wmusic（非官方）');
  assert.equal(pkg.name, 'huawei-music-desktop');
  assert.equal(pkg.build.appId, 'org.hwmusicdesktop.unofficial');
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(pkg.build.win.artifactName, 'Wmusic-${version}-${os}-${arch}-setup-unofficial.${ext}');
  assert.equal(pkg.build.publish.owner, 'wzz19931003');
  assert.equal(pkg.build.publish.repo, 'huawei-music-pad-unofficial');
  assert.ok(pkg.build.files.includes('LICENSE') && pkg.build.files.includes('NOTICE'));
});
