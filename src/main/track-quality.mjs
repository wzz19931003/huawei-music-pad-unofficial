/**
 * @typedef {{
 *   actualQuality: 'unknown' | 'standard' | 'lossless',
 *   qualityEvidence: 'none' | 'conflict' | 'provider' | 'media-header' | 'media-bytes',
 *   codec?: 'flac' | 'mp3', contentType?: string,
 *   sampleRateHz?: number, bitDepth?: number, channels?: number,
 * }} PlaybackQualityEvidence
 */

const CODEC_LABELS = new Map([
  ['flac', 'flac'], ['audio/flac', 'flac'], ['audio/x-flac', 'flac'],
  ['mp3', 'mp3'], ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'], ['audio/x-mp3', 'mp3'],
]);

function declaredCodec(value) {
  if (typeof value !== 'string' || value.length > 256) return undefined;
  const [base, ...parameters] = value.trim().toLowerCase().split(';').map(part => part.trim());
  const codec = CODEC_LABELS.get(base);
  if (!codec) {
    if (['application/octet-stream', 'binary/octet-stream'].includes(base)) return undefined;
    return /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(base) || /^(?:json|aac|alac|wav|ogg|mp4)$/.test(base) ? 'unsupported' : undefined;
  }
  for (const parameter of parameters) {
    if (!/^codecs\s*=/.test(parameter)) continue;
    const labels = parameter.slice(parameter.indexOf('=') + 1).trim().replace(/^"(.*)"$/, '$1').split(',');
    if (labels.some(label => CODEC_LABELS.get(label.trim()) !== codec)) return 'unsupported';
  }
  return codec;
}

export function confirmedPlaybackQuality(playQuality, contentType) {
  const quality = String(playQuality ?? '');
  const codec = declaredCodec(contentType);
  if (quality === '3' && codec === 'flac') return 'lossless';
  if (quality === '1' && codec === 'mp3') return 'standard';
  return 'unknown';
}

// Only the top-level fields describe the selected file. songInfo/fileInfos may describe
// other qualities or companion JSON resources, not the audio at the returned fileURL.
/** @returns {PlaybackQualityEvidence} */
export function playbackQualityEvidence(provider = {}, media = {}) {
  const unknown = { actualQuality: 'unknown', qualityEvidence: 'none' };
  const conflict = { actualQuality: 'unknown', qualityEvidence: 'conflict' };
  if (media.qualityEvidence === 'conflict') return conflict;
  const fields = ['type', 'codec', 'audioCodec', 'mediaFileType', 'mimeType', 'contentType'];
  const providerCodecs = fields.map(field => declaredCodec(provider?.[field])).filter(Boolean);
  const byteCodec = declaredCodec(media.codec);
  const headerCodec = declaredCodec(media.contentType);
  const codecs = [...providerCodecs, byteCodec, headerCodec, media.unsupported ? 'unsupported' : undefined].filter(Boolean);
  // Only the two already-established grades can contradict a codec. Unknown numeric
  // codes are deliberately not decoded, and no grade/request alone proves a format.
  const grades = [provider?.playQuality, provider?.qualityType]
    .map(value => String(value ?? '')).map(value => value === '3' ? 'flac' : value === '1' ? 'mp3' : undefined).filter(Boolean);
  if (new Set([...codecs, ...grades]).size > 1) return conflict;
  const codec = codecs[0];
  if (codec !== 'flac' && codec !== 'mp3') return unknown;
  const fromBytes = byteCodec === codec && media.qualityEvidence !== 'media-header';
  return {
    actualQuality: codec === 'flac' ? 'lossless' : 'standard',
    codec, contentType: codec === 'flac' ? 'audio/flac' : 'audio/mpeg',
    qualityEvidence: fromBytes ? 'media-bytes' : headerCodec === codec ? 'media-header' : 'provider',
    ...(fromBytes && Number.isInteger(media.sampleRateHz) && media.sampleRateHz > 0 && media.sampleRateHz <= 1048575 ? { sampleRateHz: media.sampleRateHz } : {}),
    ...(fromBytes && codec === 'flac' && Number.isInteger(media.bitDepth) && media.bitDepth >= 4 && media.bitDepth <= 32 ? { bitDepth: media.bitDepth } : {}),
    ...(fromBytes && Number.isInteger(media.channels) && media.channels >= 1 && media.channels <= 8 ? { channels: media.channels } : {}),
  };
}
