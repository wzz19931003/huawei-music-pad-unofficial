import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('donation assets are the two user-provided payment codes with verified unchanged payloads', async () => {
  const manifestUrl = new URL('../build/donation-assets.json', import.meta.url);
  const manifest = await readFile(manifestUrl, 'utf8').then(JSON.parse).catch(() => null);
  assert.ok(manifest, 'real user-provided QR assets and an integrity record are required; no placeholder codes');
  assert.deepEqual(manifest.distributionPermission, { installer: true, publicSource: true });
  assert.equal(manifest.paymentAttempted, false);
  assert.deepEqual(Object.keys(manifest.codes).sort(), ['alipay', 'wechat']);
  const expected = {
    wechat: { source: '7596261c9a8f26c2b6cbec854ed8d1dba0ecb2917d48504f2a0777b9a61d5aa1', payload: 'f4102bd4d516781a99d9619f6b27d59a5efe250281edee76aa63ed1dae93adcd' },
    alipay: { source: '84bab79d617e7b3a2ae65d72a185d13b5372766561675f984019056a3eacb366', payload: '9b4deec8098f02c4861108f63e788935d5d5ccb24729e4048739e06ec004b428' },
  };
  for (const method of ['wechat', 'alipay']) {
    const info = manifest.codes[method];
    assert.equal(info.sourceSha256, expected[method].source);
    assert.equal(info.payloadSha256, expected[method].payload);
    assert.equal(info.payloadUnchanged, true);
    assert.equal(info.display300pxDecoded, true);
    assert.equal(info.providerFormatConfirmed, true);
    assert.equal(info.asset, `src/renderer/assets/donation-${method}.png`);
    const bytes = await readFile(new URL(`../${info.asset}`, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), info.assetSha256);
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
  assert.doesNotMatch(JSON.stringify(manifest), /wxp:\/\/|https?:\/\/qr\.alipay\.com/i, 'do not print or store the payment addresses in the audit record');
});
