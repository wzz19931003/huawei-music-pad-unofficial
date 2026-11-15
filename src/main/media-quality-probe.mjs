import { fetch as httpFetch } from 'undici';
import { isSafeMediaUrl } from '../safe-media-url.mjs';
import { playbackQualityEvidence } from './track-quality.mjs';

const PROBE_MAX_BYTES = 16 * 1024;

// Only container/header identification: no decryption, decoding or quality upsampling claims.
export function inspectAudioBytes(value) {
  if (!(value instanceof Uint8Array)) return {};
  const bytes = Buffer.from(value.buffer, value.byteOffset, Math.min(value.byteLength, PROBE_MAX_BYTES));
  const detected = inspectFlac(bytes) ?? inspectMp3(bytes);
  if (detected) return detected;
  const prefix = bytes.toString('utf8', 0, Math.min(bytes.length, 256)).trimStart();
  if (/^[<{\[]/.test(prefix) || bytes.toString('latin1', 0, 4) === 'OggS'
    || (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WAVE')
    || bytes.toString('latin1', 4, 8) === 'ftyp'
    || (bytes.length >= 4 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && ((bytes[1] >> 1) & 3) !== 1)) return { unsupported: true };
  return {};
}

function inspectFlac(bytes) {
  if (bytes.length < 42 || bytes.toString('latin1', 0, 4) !== 'fLaC') return undefined;
  if ((bytes[4] & 0x7f) !== 0 || bytes.readUIntBE(5, 3) !== 34) return undefined;
  const minBlock = bytes.readUInt16BE(8);
  const maxBlock = bytes.readUInt16BE(10);
  const packed = bytes.readBigUInt64BE(18);
  const sampleRateHz = Number(packed >> 44n);
  const channels = Number((packed >> 41n) & 7n) + 1;
  const bitDepth = Number((packed >> 36n) & 31n) + 1;
  const minFrame = bytes.readUIntBE(12, 3);
  const maxFrame = bytes.readUIntBE(15, 3);
  if (minBlock < 16 || maxBlock < minBlock || (minFrame && maxFrame && minFrame > maxFrame) || sampleRateHz === 0 || bitDepth < 4) return undefined;
  return { codec: 'flac', sampleRateHz, bitDepth, channels };
}

function mp3Frame(bytes, offset) {
  if (offset + 4 > bytes.length || bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return undefined;
  const version = (bytes[offset + 1] >> 3) & 3;
  const layer = (bytes[offset + 1] >> 1) & 3;
  const bitrateIndex = bytes[offset + 2] >> 4;
  const sampleRateIndex = (bytes[offset + 2] >> 2) & 3;
  // Free-format, reserved versions/layers/rates and Layer I/II are not MP3 proof.
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3 || (bytes[offset + 3] & 3) === 2) return undefined;
  const kbps = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
    : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex];
  const sampleRateHz = [44100, 48000, 32000][sampleRateIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  const length = Math.floor((version === 3 ? 144000 : 72000) * kbps / sampleRateHz) + ((bytes[offset + 2] >> 1) & 1);
  return { version, length, sampleRateHz, channels: (bytes[offset + 3] >> 6) === 3 ? 1 : 2 };
}

function inspectMp3(bytes) {
  let offset = 0;
  if (bytes.toString('latin1', 0, 3) === 'ID3') {
    if (bytes.length < 10 || ![2, 3, 4].includes(bytes[3]) || bytes[4] === 0xff) return undefined;
    if ((bytes[5] & (bytes[3] === 2 ? 0x3f : bytes[3] === 3 ? 0x1f : 0x0f)) || bytes.subarray(6, 10).some(value => value & 0x80)) return undefined;
    const tagSize = bytes.subarray(6, 10).reduce((size, value) => size * 128 + value, 0);
    offset = 10 + tagSize;
    if (bytes[3] === 4 && (bytes[5] & 0x10)) {
      if (offset + 10 > bytes.length || bytes.toString('latin1', offset, offset + 3) !== '3DI'
        || !bytes.subarray(offset + 3, offset + 10).equals(bytes.subarray(3, 10))) return undefined;
      offset += 10;
    }
  }
  const first = mp3Frame(bytes, offset);
  if (!first) return undefined;
  const second = mp3Frame(bytes, offset + first.length);
  if (!second || offset + first.length + second.length > bytes.length
    || first.version !== second.version || first.sampleRateHz !== second.sampleRateHz || first.channels !== second.channels) return undefined;
  // Bitrate is intentionally absent: two frames cannot establish a VBR file's average.
  return { codec: 'mp3', sampleRateHz: first.sampleRateHz, channels: first.channels };
}

function cancelBody(body) {
  try { if (body) void body.cancel().catch(() => undefined); } catch { /* Cleanup cannot leak transport errors. */ }
}

// The deadline is shared by headers, redirects, reads and cleanup. It cannot be
// enlarged by callers; injection exists only for deterministic offline tests.
export async function probeMediaQuality(url, { fetchImpl = httpFetch, timeoutMs = 2500 } = {}) {
  if (typeof url !== 'string' || !isSafeMediaUrl(url)) return playbackQualityEvidence();
  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) ? Math.min(2500, Math.max(1, Math.floor(timeoutMs))) : 2500;
  const timer = setTimeout(() => controller.abort(), timeout);
  const stopped = new Promise(resolve => controller.signal.addEventListener('abort', () => resolve(undefined), { once: true }));
  const withinDeadline = async operation => {
    const value = await Promise.race([operation, stopped]);
    if (controller.signal.aborted) throw new Error('Media probe stopped');
    return value;
  };
  let response;
  let reader;
  try {
    for (let redirects = 0; ; redirects++) {
      response = await withinDeadline(Promise.resolve(fetchImpl(url, {
        method: 'GET', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { accept: 'audio/*,application/octet-stream', range: `bytes=0-${PROBE_MAX_BYTES - 1}`, 'accept-encoding': 'identity' },
        signal: controller.signal,
      })).then(resource => {
        if (controller.signal.aborted) cancelBody(resource?.body);
        return resource;
      }));
      if (response.redirected || (response.url && !isSafeMediaUrl(response.url))) return playbackQualityEvidence();
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (response.body) void response.body.cancel().catch(() => undefined);
      const location = response.headers.get('location');
      if (!location || redirects >= 2) return playbackQualityEvidence();
      const next = new URL(location, url).href;
      if (!isSafeMediaUrl(next)) return playbackQualityEvidence();
      url = next;
    }
    if (![200, 206].includes(response.status)) return playbackQualityEvidence();
    const encoding = response.headers.get('content-encoding');
    if (encoding && encoding.trim().toLowerCase() !== 'identity') return playbackQualityEvidence();
    let rangeBytes;
    if (response.status === 206) {
      const range = /^bytes 0-(\d+)\/(\d+|\*)$/i.exec(response.headers.get('content-range') ?? '');
      if (!range || !Number.isSafeInteger(Number(range[1])) || Number(range[1]) >= PROBE_MAX_BYTES
        || (range[2] !== '*' && (!Number.isSafeInteger(Number(range[2])) || Number(range[2]) <= Number(range[1])))) return playbackQualityEvidence();
      rangeBytes = Number(range[1]) + 1;
    }
    const contentType = response.headers.get('content-type');
    const bytes = Buffer.alloc(PROBE_MAX_BYTES);
    let size = 0;
    let detected = {};
    if (response.body) {
      reader = response.body.getReader();
      while (size < PROBE_MAX_BYTES) {
        const { done, value } = await withinDeadline(reader.read());
        if (done) break;
        // Empty/non-byte chunks are not useful evidence and must not create a
        // microtask-only spin that starves the deadline timer.
        if (!(value instanceof Uint8Array) || value.byteLength === 0) return playbackQualityEvidence();
        if (rangeBytes !== undefined && size + value.byteLength > rangeBytes) return playbackQualityEvidence();
        const length = Math.min(value.byteLength, PROBE_MAX_BYTES - size);
        bytes.set(value.subarray(0, length), size);
        size += length;
        detected = inspectAudioBytes(bytes.subarray(0, size));
        if (detected.codec || detected.unsupported) break;
      }
    }
    return playbackQualityEvidence({}, { contentType, ...detected });
  } catch {
    return playbackQualityEvidence();
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Do not let a broken cancellation promise hold up playback.
    cancelBody(reader ?? response?.body);
    try { reader?.releaseLock(); } catch { /* A pending read may already be aborting. */ }
  }
}
