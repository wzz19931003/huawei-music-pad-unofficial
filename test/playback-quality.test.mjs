import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { isSafeMediaUrl } from '../src/safe-media-url.mjs';
import { probeMediaQuality } from '../src/main/media-quality-probe.mjs';
import { confirmedPlaybackQuality, playbackQualityEvidence } from '../src/main/track-quality.mjs';

test('confirms standard and lossless only when quality and declared codec agree', () => {
  assert.equal(confirmedPlaybackQuality('1', 'audio/mpeg'), 'standard');
  assert.equal(confirmedPlaybackQuality('3', 'audio/flac'), 'lossless');
});

test('unknown, missing, or conflicting codec evidence is not advertised as confirmed quality', () => {
  for (const [quality, type] of [
    ['3', 'application/json'],
    ['3', 'audio/mpeg'],
    ['1', 'audio/flac'],
    ['1', undefined],
    ['7', 'audio/flac'],
  ]) assert.equal(confirmedPlaybackQuality(quality, type), 'unknown');
});

test('codec matching is case-insensitive and accepts explicit codec labels', () => {
  assert.equal(confirmedPlaybackQuality('3', 'FLAC'), 'lossless');
  assert.equal(confirmedPlaybackQuality('1', 'audio/mpeg; codecs=MP3'), 'standard');
});

test('explicit provider codec or MIME confirms the delivered format without a quality number', () => {
  for (const field of ['type', 'codec', 'audioCodec', 'mediaFileType', 'mimeType', 'contentType']) {
    assert.deepEqual(playbackQualityEvidence({ [field]: 'FLAC' }), {
      actualQuality: 'lossless', codec: 'flac', contentType: 'audio/flac', qualityEvidence: 'provider',
    });
    assert.deepEqual(playbackQualityEvidence({ [field]: 'audio/mpeg; codecs="mp3"' }), {
      actualQuality: 'standard', codec: 'mp3', contentType: 'audio/mpeg', qualityEvidence: 'provider',
    });
  }
});

test('contradictory provider declarations and returned known grades stay unknown', () => {
  for (const provider of [
    { codec: 'flac', mimeType: 'audio/mpeg' },
    { type: 'audio/flac', audioCodec: 'mp3' },
    { playQuality: '1', codec: 'flac' },
    { playQuality: '3', codec: 'mp3' },
    { playQuality: '3', qualityType: '1', type: 'flac' },
  ]) {
    assert.deepEqual(playbackQualityEvidence(provider), { actualQuality: 'unknown', qualityEvidence: 'conflict' });
  }
});

test('only concrete codec labels count; requests, extensions, numeric codes and auxiliary files do not', () => {
  for (const provider of [
    {}, null, { requestedQuality: 'lossless', qualityType: '3' },
    { playQuality: '7', type: 18 }, { fileURL: 'https://x.dbankcdn.cn/song.flac' },
    { songInfo: { type: 'flac' }, fileInfos: [{ mediaFileType: 'FLAC' }] },
    { type: 'not-flac' }, { type: 'text/html; name=flac' }, { codec: 'mp3-fallback' },
    { type: 'audio/mpeg; codecs=aac' }, { type: 'audio/flac; codecs=mp3' },
  ]) assert.equal(playbackQualityEvidence(provider).actualQuality, 'unknown');
  assert.equal(playbackQualityEvidence({ type: 'audio/x-flac', playQuality: '7' }).actualQuality, 'lossless');
  assert.equal(confirmedPlaybackQuality('3', 'text/html; name=flac'), 'unknown');
});

test('media evidence fills missing declarations but never overrides contradictions or invents metrics', () => {
  assert.deepEqual(playbackQualityEvidence({}, { contentType: 'audio/x-flac' }), {
    actualQuality: 'lossless', codec: 'flac', contentType: 'audio/flac', qualityEvidence: 'media-header',
  });
  assert.deepEqual(playbackQualityEvidence({ type: 18 }, { codec: 'flac', sampleRateHz: 96000, bitDepth: 24, channels: 2 }), {
    actualQuality: 'lossless', codec: 'flac', contentType: 'audio/flac', qualityEvidence: 'media-bytes',
    sampleRateHz: 96000, bitDepth: 24, channels: 2,
  });
  for (const [provider, media] of [
    [{ codec: 'mp3' }, { codec: 'flac' }],
    [{ playQuality: '1' }, { codec: 'flac' }],
    [{}, { codec: 'flac', contentType: 'audio/aac' }],
    [{}, { codec: 'mp3', contentType: 'audio/flac' }],
    [{ codec: 'flac' }, { qualityEvidence: 'conflict' }],
    [{}, { contentType: 'audio/flac', unsupported: true }],
  ]) assert.deepEqual(playbackQualityEvidence(provider, media), { actualQuality: 'unknown', qualityEvidence: 'conflict' });
  assert.deepEqual(playbackQualityEvidence({}, { contentType: 'audio/mpeg', sampleRateHz: 44100, bitDepth: 16 }), {
    actualQuality: 'standard', codec: 'mp3', contentType: 'audio/mpeg', qualityEvidence: 'media-header',
  });
  assert.deepEqual(playbackQualityEvidence({ sampleRate: 192000, bitDepth: 24 }), { actualQuality: 'unknown', qualityEvidence: 'none' });
});

test('non-audio MIME declarations conflict with audio bytes while generic binary MIME remains neutral', () => {
  for (const contentType of ['application/xml', 'application/pdf', 'video/mpeg', 'application/vnd.vendor.encrypted', 'audio/ogg', 'application/json; charset=utf-8']) {
    assert.deepEqual(playbackQualityEvidence({}, { contentType, codec: 'flac' }), { actualQuality: 'unknown', qualityEvidence: 'conflict' });
  }
  assert.equal(playbackQualityEvidence({ codec: 'FLAC', contentType: 'application/octet-stream' }).actualQuality, 'lossless');
  assert.equal(playbackQualityEvidence({}, { contentType: 'application/octet-stream' }).actualQuality, 'unknown');
});

// Exercise the actual main-process function and its scalar normalizers without
// booting Electron or touching accounts/network. Records below are synthetic
// contract inputs, not claims about a captured provider response.
function mainResolver(provider, fetchImpl) {
  const source = readFileSync(new URL('../src/main/huawei.ts', import.meta.url), 'utf8');
  const declaration = source.match(/^export async function resolvePlayback\([\s\S]*?^\}/m)?.[0];
  const normalizers = source.match(/^const id = [\s\S]*?^\};/m)?.[0];
  assert.ok(declaration); assert.ok(normalizers);
  const javascript = transformSync(`${normalizers}\n${declaration.replace(/^export\s+/, '')}`,
    { loader: 'ts', target: 'es2022' }).code;
  const bindings = { clientFor: () => ({ resolvePlayback: async () => provider }), isSafeMediaUrl,
    confirmedPlaybackQuality, playbackQualityEvidence, probeMediaQuality, httpFetch: fetchImpl };
  return new Function(...Object.keys(bindings), `${javascript}\nreturn resolvePlayback;`)(...Object.values(bindings));
}

test('main resolvePlayback probes missing selected-file evidence and returns byte-derived quality without changing the media URL', async () => {
  const url = 'https://a.dbankcdn.cn/opaque?signature=synthetic';
  const provider = { fileURL: url, type: 18, songInfo: { duration: '25.5' }, fileInfos: [{ mediaFileType: 'JSON', fileURL: 'https://a.dbankcdn.cn/auxiliary' }] };
  let calls = 0;
  const resolver = mainResolver(provider, async (address, options) => {
    calls++; assert.equal(address, url); assert.equal(new Headers(options.headers).has('authorization'), false);
    const bytes = Buffer.alloc(42);
    bytes.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34, 0x10, 0, 0x10, 0]);
    bytes.writeBigUInt64BE((96000n << 44n) | (1n << 41n) | (23n << 36n), 18);
    return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } });
  });
  assert.deepEqual(await resolver({ token: 'NEVER-SEND-TO-CDN' }, 'synthetic-track', 'lossless'), {
    url, actualQuality: 'lossless', contentType: 'audio/flac', codec: 'flac', qualityEvidence: 'media-bytes',
    durationSeconds: 25.5, sampleRateHz: 96000, bitDepth: 24, channels: 2,
  });
  assert.equal(calls, 1);
});

test('main resolver skips probing explicit or contradictory evidence and keeps failed probes honestly unknown', async () => {
  const url = 'https://a.dbankcdn.cn/x';
  for (const [declarations, quality, evidence] of [
    [{ audioCodec: 'FLAC' }, 'lossless', 'provider'], [{ mimeType: 'audio/mpeg' }, 'standard', 'provider'],
    [{ codec: 'flac', mimeType: 'audio/mpeg' }, 'unknown', 'conflict'],
    [{ playQuality: '1', type: 'audio/flac' }, 'unknown', 'conflict'],
  ]) {
    let probes = 0;
    const result = await mainResolver({ fileURL: url, ...declarations }, async () => { probes++; throw new Error('must not probe'); })({}, 'synthetic', 'lossless');
    assert.equal(result.actualQuality, quality); assert.equal(result.qualityEvidence, evidence); assert.equal(probes, 0);
  }
  let probes = 0;
  const failed = await mainResolver({ fileURL: `${url}.flac`, playQuality: '3' }, async () => { probes++; throw new Error('PRIVATE'); })({}, 'synthetic', 'lossless');
  assert.equal(failed.actualQuality, 'unknown'); assert.equal(failed.qualityEvidence, 'none'); assert.equal(failed.codec, undefined); assert.equal(probes, 1);
  const conflict = await mainResolver({ fileURL: url, playQuality: '1' }, async () => new Response(null, { headers: { 'content-type': 'audio/flac' } }))({}, 'synthetic', 'lossless');
  assert.equal(conflict.actualQuality, 'unknown'); assert.equal(conflict.qualityEvidence, 'conflict');
  for (const fileURL of [undefined, 'https://evil.test/track.flac']) {
    let unsafeProbes = 0;
    await assert.rejects(mainResolver({ fileURL, fileInfos: [{ fileURL: url }] }, async () => { unsafeProbes++; })({}, 'synthetic', 'lossless'), /服务端未返回安全的音频地址/);
    assert.equal(unsafeProbes, 0);
  }
});
