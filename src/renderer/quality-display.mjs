/** Actual playback evidence only: the selected quality preference is not an input. */
export function describePlaybackQuality(playback = {}, { pending = false } = {}) {
  if (pending) return { label: '正在识别实际格式…', status: 'pending', detail: '正在解析本次音源；上首曲目的格式信息已清除。' };
  if (playback.qualityEvidence === 'conflict' ||
      playback.codec === 'mp3' && playback.actualQuality === 'lossless' ||
      playback.codec === 'flac' && playback.actualQuality === 'standard') {
    return { label: '格式信息冲突', status: 'conflict', detail: '服务字段或媒体证据不一致，本次不确认音质等级。' };
  }
  if (playback.actualQuality === 'lossless' || playback.actualQuality === 'standard') {
    const isFlac = playback.actualQuality === 'lossless';
    const sources = { provider: '接口编码字段', 'media-header': '媒体响应头', 'media-bytes': '媒体数据帧' };
    const source = Object.hasOwn(sources, playback.qualityEvidence) ? sources[playback.qualityEvidence] : '后端格式结果（未返回证据类型）';
    const parts = [`依据：${source}`, isFlac ? 'FLAC 编码不证明母带质量' : 'MP3 有损编码'];
    if (playback.qualityEvidence === 'media-bytes') {
      if (Number.isFinite(playback.sampleRateHz) && playback.sampleRateHz > 0) parts.push(`${playback.sampleRateHz / 1000} kHz`);
      if (isFlac && Number.isFinite(playback.bitDepth) && playback.bitDepth > 0) parts.push(`${playback.bitDepth} bit`);
      if (Number.isFinite(playback.channels) && playback.channels > 0) parts.push(`${playback.channels} 声道`);
    }
    return { label: isFlac ? '无损音质 · FLAC' : '标准音质 · MP3', status: 'confirmed', detail: parts.join(' · ') };
  }
  return { label: '音源格式未识别', status: 'unknown', detail: '缺少可验证的 FLAC / MP3 证据，不按设置偏好猜测实际音质。' };
}
