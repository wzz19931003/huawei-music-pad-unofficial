import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { inspectAudioBytes, probeMediaQuality } from '../src/main/media-quality-probe.mjs';

// Deliberately synthetic container/header fixtures, never captured account/API data.
function flacHeader(sampleRateHz = 96000, bitDepth = 24, channels = 2) {
  const bytes = Buffer.alloc(42);
  bytes.write('fLaC');
  bytes[4] = 0x80;
  bytes[7] = 34;
  bytes.writeUInt16BE(4096, 8);
  bytes.writeUInt16BE(4096, 10);
  const packed = (BigInt(sampleRateHz) << 44n) | (BigInt(channels - 1) << 41n)
    | (BigInt(bitDepth - 1) << 36n) | 96000n;
  bytes.writeBigUInt64BE(packed, 18);
  return bytes;
}

test('native FLAC requires complete valid STREAMINFO before reporting byte-derived parameters', () => {
  for (const [sampleRateHz, bitDepth, channels] of [[96000, 24, 2], [44100, 16, 1], [1048575, 32, 8]]) {
    const bytes = flacHeader(sampleRateHz, bitDepth, channels);
    assert.deepEqual(inspectAudioBytes(bytes), { codec: 'flac', sampleRateHz, bitDepth, channels });
    for (const length of [0, 4, 7, 8, 18, 41]) assert.deepEqual(inspectAudioBytes(bytes.subarray(0, length)), {});
  }
  for (const mutate of [
    bytes => { bytes[4] = 1; }, bytes => { bytes[7] = 33; },
    bytes => { bytes.writeUInt16BE(0, 8); }, bytes => { bytes.writeUInt16BE(1, 10); },
    bytes => { bytes.fill(0, 18, 21); },
  ]) {
    const bytes = flacHeader(); mutate(bytes);
    assert.equal(inspectAudioBytes(bytes).codec, undefined);
  }
  assert.deepEqual(inspectAudioBytes('fLaC'), {});
});

function mp3Frames({ version = 3, mode = 0, bitrateIndex = 9, sampleRateIndex = 0, padding = 0 } = {}) {
  const rate = [44100, 48000, 32000][sampleRateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex];
  const length = Math.floor((version === 3 ? 144000 : 72000) * kbps / rate) + padding;
  const frame = Buffer.alloc(length);
  frame.set([0xff, 0xe3 | (version << 3), (bitrateIndex << 4) | (sampleRateIndex << 2) | (padding << 1), mode << 6]);
  return Buffer.concat([frame, frame]);
}

function id3Tag(payload = Buffer.alloc(0), version = 4, footer = false) {
  const header = Buffer.from([0x49, 0x44, 0x33, version, 0, footer ? 0x10 : 0, 0, 0, 0, 0]);
  let size = payload.length;
  for (let i = 9; i >= 6; i--) { header[i] = size & 0x7f; size >>>= 7; }
  return Buffer.concat([header, payload, ...(footer ? [Buffer.from([0x33, 0x44, 0x49, ...header.subarray(3)])] : [])]);
}

test('MP3 requires two complete matching Layer III frames, optionally following a bounded ID3 tag', () => {
  for (const [options, sampleRateHz, channels] of [
    [{}, 44100, 2], [{ version: 2, mode: 3, bitrateIndex: 8, padding: 1 }, 22050, 1],
    [{ version: 0, sampleRateIndex: 1, bitrateIndex: 4 }, 12000, 2],
  ]) {
    const frames = mp3Frames(options);
    const expected = { codec: 'mp3', sampleRateHz, channels };
    assert.deepEqual(inspectAudioBytes(frames), expected);
    for (const tag of [id3Tag(), id3Tag(Buffer.from('flac mp3 strings are not codec evidence'), 3), id3Tag(Buffer.alloc(7), 4, true)]) {
      assert.deepEqual(inspectAudioBytes(Buffer.concat([tag, frames])), expected);
      assert.deepEqual(inspectAudioBytes(tag), {});
    }
    assert.deepEqual(inspectAudioBytes(frames.subarray(0, frames.length - 1)), {});
  }
});

test('corrupt magic, reserved MPEG headers, and malformed or excessive ID3 cannot identify audio', () => {
  const highBitFlac = flacHeader(); highBitFlac[0] |= 0x80;
  const wrongFrameBounds = flacHeader(); wrongFrameBounds.writeUIntBE(300, 12, 3); wrongFrameBounds.writeUIntBE(200, 15, 3);
  const invalid = [highBitFlac, wrongFrameBounds, Buffer.from('ID3'), mp3Frames().subarray(0, 4),
    Buffer.concat([Buffer.from('<html>'), mp3Frames()]), Buffer.concat([id3Tag(Buffer.alloc(17000)), mp3Frames()])];
  for (const mutate of [
    bytes => { bytes[1] = 0xeb; }, // reserved MPEG version
    bytes => { bytes[1] = 0xfd; }, // Layer II is not MP3
    bytes => { bytes[2] = 0xf0; }, bytes => { bytes[2] = 0x0c; },
    bytes => { bytes[3] = 2; }, bytes => { bytes[418] = 0xf3; },
  ]) { const bytes = mp3Frames(); mutate(bytes); invalid.push(bytes); }
  for (const mutate of [
    tag => { tag[6] = 0x80; }, tag => { tag[3] = 5; }, tag => { tag[5] = 1; },
    tag => { tag[0] |= 0x80; }, tag => { tag[4] = 0xff; }, tag => { tag[9] = 127; },
  ]) { const tag = id3Tag(); mutate(tag); invalid.push(Buffer.concat([tag, mp3Frames()])); }
  for (const bytes of invalid) assert.equal(inspectAudioBytes(bytes).codec, undefined);
});

test('Range probe identifies FLAC, omits account credentials, then cancels instead of downloading audio', async () => {
  let request; let pulls = 0; let cancelled = false;
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(flacHeader()); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const result = await probeMediaQuality('https://audio.dbankcdn.cn/opaque?signed=fixture', {
    fetchImpl: async (url, options) => {
      request = { url, ...options };
      return new Response(body, { status: 206, headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 0-16383/1000000' } });
    },
  });
  assert.deepEqual(result, {
    actualQuality: 'lossless', codec: 'flac', contentType: 'audio/flac', qualityEvidence: 'media-bytes',
    sampleRateHz: 96000, bitDepth: 24, channels: 2,
  });
  assert.equal(request.method, 'GET'); assert.equal(request.redirect, 'manual');
  assert.equal(request.credentials, 'omit'); assert.equal(request.referrerPolicy, 'no-referrer');
  const headers = new Headers(request.headers);
  assert.equal(headers.get('range'), 'bytes=0-16383');
  assert.equal(headers.get('accept-encoding'), 'identity');
  assert.deepEqual([...headers.keys()].sort(), ['accept', 'accept-encoding', 'range']);
  assert.equal(pulls, 1); assert.equal(cancelled, true); assert.equal(request.signal.aborted, true);
});

const unknown = { actualQuality: 'unknown', qualityEvidence: 'none' };

test('only allowlisted HTTPS URLs and at most two revalidated manual redirects can be probed', async () => {
  const urls = []; const cancelled = [];
  const result = await probeMediaQuality('https://a.dbankcdn.cn/start', {
    fetchImpl: async (url, options) => {
      urls.push(String(url)); assert.equal(options.redirect, 'manual');
      if (urls.length < 3) return new Response(new ReadableStream({ cancel() { cancelled.push(url); } }), {
        status: urls.length === 1 ? 302 : 307,
        headers: { location: urls.length === 1 ? '/relative' : 'https://b.tingmall.com/audio' },
      });
      return new Response(mp3Frames(), { headers: { 'content-type': 'audio/mpeg' } });
    },
  });
  assert.equal(result.codec, 'mp3'); assert.equal(result.qualityEvidence, 'media-bytes');
  assert.deepEqual(urls, ['https://a.dbankcdn.cn/start', 'https://a.dbankcdn.cn/relative', 'https://b.tingmall.com/audio']);
  assert.deepEqual(cancelled, urls.slice(0, 2));
  for (const url of ['http://a.dbankcdn.cn/x', 'https://a.dbankcdn.cn:444/x', 'https://u:p@a.dbankcdn.cn/x',
    'https://dbankcdn.cn/x', 'https://a.dbankcdn.cn.evil.test/x', 'https://127.0.0.1/x', 'file:///x', 'not-a-url']) {
    let calls = 0;
    assert.deepEqual(await probeMediaQuality(url, { fetchImpl: async () => { calls++; return new Response(flacHeader()); } }), unknown);
    assert.equal(calls, 0);
    if (url === 'not-a-url') continue; // This is a valid relative redirect, already tested above.
    let redirectCalls = 0; let redirectCancelled = false;
    assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => {
      redirectCalls++;
      return new Response(new ReadableStream({ cancel() { redirectCancelled = true; } }), { status: 308, headers: { location: url } });
    } }), unknown);
    assert.equal(redirectCalls, 1); assert.equal(redirectCancelled, true);
  }
  let loops = 0;
  assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/loop', { fetchImpl: async () => {
    loops++; return new Response(null, { status: 301, headers: { location: '/loop' } });
  } }), unknown);
  assert.equal(loops, 3);
});

test('HTTP errors, nonzero/malformed ranges, encoded bodies and auto-followed responses are not evidence', async () => {
  for (const [status, headers, properties] of [
    [403, { 'content-type': 'audio/flac' }], [404, {}], [500, {}],
    [206, {}], [206, { 'content-range': 'bytes 1-42/1000' }],
    [206, { 'content-range': 'bytes 0-41/20' }], [206, { 'content-range': 'garbage' }],
    [206, { 'content-range': 'bytes 0-999999/1000000' }],
    [200, { 'content-encoding': 'gzip' }], [200, {}, { redirected: true }],
    [200, {}, { url: 'https://evil.test/redirected' }],
  ]) {
    let cancelled = false; let pulls = 0;
    const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(flacHeader()); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const response = new Response(body, { status, headers });
    for (const [key, value] of Object.entries(properties ?? {})) Object.defineProperty(response, key, { value });
    assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => response }), unknown);
    assert.equal(cancelled, true); assert.equal(pulls, 0);
  }
});

test('one short deadline covers fetch and stalled bodies even when transport or cancellation never settles', async () => {
  for (const stage of ['fetch', 'body']) {
    let signal; let cancelled = false;
    const task = probeMediaQuality('https://a.dbankcdn.cn/x?signature=PRIVATE', {
      timeoutMs: 5,
      fetchImpl: async (_url, options) => {
        signal = options.signal;
        if (stage === 'fetch') return new Promise(() => {});
        return new Response(new ReadableStream({
          pull() { return new Promise(() => {}); },
          cancel() { cancelled = true; return new Promise(() => {}); },
        }, { highWaterMark: 0 }), { headers: { 'content-type': 'audio/flac' } });
      },
    });
    let guard;
    try {
      const result = await Promise.race([task, new Promise(resolve => { guard = setTimeout(() => resolve('deadline missing'), 100); })]);
      assert.deepEqual(result, unknown);
      assert.equal(signal.aborted, true);
      if (stage === 'body') assert.equal(cancelled, true);
    } finally { clearTimeout(guard); }
  }
  const failed = await probeMediaQuality('https://a.dbankcdn.cn/x?signature=PRIVATE', {
    fetchImpl: async () => { throw new Error('PRIVATE TOKEN AND URL'); },
  });
  assert.deepEqual(failed, unknown);
});

test('late responses and rejected stream/cancel operations are cleaned up without leaking failures', async () => {
  let finishFetch; let cancelled = false;
  const task = probeMediaQuality('https://a.dbankcdn.cn/x', { timeoutMs: 5,
    fetchImpl: () => new Promise(resolve => { finishFetch = resolve; }),
  });
  assert.deepEqual(await task, unknown);
  finishFetch(new Response(new ReadableStream({ cancel() { cancelled = true; throw new Error('PRIVATE CANCEL'); } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) { controller.error(new Error('PRIVATE READ')); },
    cancel() { throw new Error('PRIVATE CANCEL'); },
  })) }), unknown);
});

test('recognizable non-audio/other formats cannot be mislabeled by an audio MIME header', async () => {
  const otherFormats = [Buffer.from('{"error":"PRIVATE"}'), Buffer.from(' \n<html>login</html>'),
    Buffer.from('<?xml version="1.0"?><error/>'), Buffer.from('OggS\0\0'), Buffer.from('RIFF0000WAVE'),
    Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0, 0]),
  ];
  const layer2 = mp3Frames(); layer2[1] = 0xfd; otherFormats.push(layer2);
  for (const bytes of otherFormats) {
    assert.deepEqual(inspectAudioBytes(bytes), { unsupported: true });
    assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () =>
      new Response(bytes, { headers: { 'content-type': 'audio/flac' } }) }), { actualQuality: 'unknown', qualityEvidence: 'conflict' });
  }
  for (const [bytes, contentType] of [[flacHeader(), 'audio/mpeg'], [mp3Frames(), 'audio/flac'], [flacHeader(), 'application/json']]) {
    assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () =>
      new Response(bytes, { headers: { 'content-type': contentType } }) }), { actualQuality: 'unknown', qualityEvidence: 'conflict' });
  }
  assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () =>
    new Response(null, { headers: { 'content-type': 'audio/flac' } }) }), {
    actualQuality: 'lossless', codec: 'flac', contentType: 'audio/flac', qualityEvidence: 'media-header',
  });
});

test('ignored Range, huge chunks, fragmented headers and empty chunks cannot exceed the byte/read budget', async () => {
  for (const chunk of [Buffer.alloc(8192), Buffer.concat([Buffer.alloc(16384), flacHeader(), Buffer.alloc(48000)])]) {
    let pulls = 0; let cancelled = false;
    const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(chunk); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/not-a-real.flac', {
      fetchImpl: async () => new Response(body, { status: 200, headers: { 'content-length': '999999999' } }),
    }), unknown);
    assert.equal(pulls, chunk.length === 8192 ? 2 : 1); assert.equal(cancelled, true);
  }
  let reads = 0;
  const emptyThenAudio = new ReadableStream({ pull(controller) { reads++; controller.enqueue(reads < 100 ? new Uint8Array() : flacHeader()); } }, { highWaterMark: 0 });
  assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => new Response(emptyThenAudio) }), unknown);
  assert.equal(reads, 1);
  for (const bytes of [flacHeader(), Buffer.concat([id3Tag(Buffer.alloc(8)), mp3Frames()])]) {
    let offset = 0;
    const body = new ReadableStream({ pull(controller) { controller.enqueue(bytes.subarray(offset, ++offset)); } }, { highWaterMark: 0 });
    const result = await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => new Response(body) });
    assert.equal(result.qualityEvidence, 'media-bytes'); assert.equal(offset, bytes.length);
  }
});

test('a partial response cannot claim bytes outside its declared Content-Range', async () => {
  assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () =>
    new Response(flacHeader(), { status: 206, headers: { 'content-type': 'audio/flac', 'content-range': 'bytes 0-0/1000' } }) }), unknown);
  const result = await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () =>
    new Response(flacHeader(), { status: 206, headers: { 'content-range': 'bytes 0-41/*' } }) });
  assert.equal(result.codec, 'flac'); assert.equal(result.qualityEvidence, 'media-bytes');
});

test('only parsed byte parameters survive, including the full FLAC STREAMINFO sample-rate range', async () => {
  const result = await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => new Response(flacHeader(1048575, 32, 8)) });
  assert.equal(result.sampleRateHz, 1048575); assert.equal(result.bitDepth, 32); assert.equal(result.channels, 8);
  const mp3 = await probeMediaQuality('https://a.dbankcdn.cn/x', { fetchImpl: async () => new Response(mp3Frames()) });
  assert.equal(mp3.sampleRateHz, 44100); assert.equal(mp3.bitDepth, undefined); assert.equal(mp3.bitrateKbps, undefined);
});

test('default transport uses the undici global dispatcher without making a real network request', async () => {
  const previous = getGlobalDispatcher();
  const mock = new MockAgent(); mock.disableNetConnect(); setGlobalDispatcher(mock);
  try {
    mock.get('https://a.dbankcdn.cn').intercept({ path: '/mocked', method: 'GET',
      // undici appends its own identity token for Range; do not require a
      // single wire token when the explicit request already supplied identity.
      headers: { range: 'bytes=0-16383' },
    }).reply(206, flacHeader(), { headers: { 'content-range': 'bytes 0-41/42', 'content-type': 'audio/flac' } });
    const result = await probeMediaQuality('https://a.dbankcdn.cn/mocked');
    assert.equal(result.codec, 'flac'); assert.equal(result.qualityEvidence, 'media-bytes');
    mock.assertNoPendingInterceptors();
    assert.deepEqual(await probeMediaQuality('https://a.dbankcdn.cn/not-mocked'), unknown);
  } finally { setGlobalDispatcher(previous); await mock.close(); }
});
