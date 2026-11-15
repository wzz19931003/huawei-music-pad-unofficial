import test from 'node:test';
import assert from 'node:assert/strict';
import { describePlaybackQuality } from '../src/renderer/quality-display.mjs';
test('unknown actual format never echoes the selected lossless preference', () => {
  const view = describePlaybackQuality({ actualQuality: 'unknown', quality: 'lossless' });
  assert.equal(view.label, '音源格式未识别');
  assert.equal(view.status, 'unknown');
  assert.match(view.detail, /不按设置偏好/);
});
test('FLAC byte evidence renders only parsed stream parameters, not Hi-Res certification', () => {
  const view = describePlaybackQuality({ actualQuality: 'lossless', codec: 'flac', qualityEvidence: 'media-bytes', sampleRateHz: 48000, bitDepth: 24, channels: 2 });
  assert.equal(view.label, '无损音质 · FLAC');
  assert.equal(view.status, 'confirmed');
  for (const part of ['媒体数据帧', '48 kHz', '24 bit', '2 声道', '不证明母带质量']) assert.ok(view.detail.includes(part));
  assert.doesNotMatch(view.label, /Hi-Res/);
});
test('MP3 remains standard despite lossless preference and does not invent bit depth', () => {
  const view = describePlaybackQuality({ quality: 'lossless', actualQuality: 'standard', codec: 'mp3', qualityEvidence: 'media-bytes', sampleRateHz: 44100, bitDepth: 24, channels: 2 });
  assert.equal(view.label, '标准音质 · MP3');
  assert.match(view.detail, /44.1 kHz/);
  assert.doesNotMatch(view.detail, /24 bit/);
});
test('conflicting evidence never receives a confirmed quality label', () => {
  for (const input of [
    { actualQuality: 'lossless', qualityEvidence: 'conflict' },
    { actualQuality: 'lossless', codec: 'mp3', qualityEvidence: 'provider' },
  ]) {
    const view = describePlaybackQuality(input);
    assert.equal(view.label, '格式信息冲突');
    assert.equal(view.status, 'conflict');
  }
});
test('provider declarations and response headers are distinguishable from byte verification', () => {
  for (const [qualityEvidence, expected] of [['provider', '接口编码字段'], ['media-header', '媒体响应头']]) {
    const view = describePlaybackQuality({ actualQuality: 'lossless', codec: 'flac', qualityEvidence, sampleRateHz: 96000, bitDepth: 24 });
    assert.match(view.detail, new RegExp(expected));
    assert.doesNotMatch(view.detail, /96 kHz|24 bit|媒体数据帧/);
  }
});
test('new-track identification state never displays the preceding FLAC label', () => {
  const view = describePlaybackQuality({ actualQuality: 'lossless', codec: 'flac' }, { pending: true });
  assert.equal(view.label, '正在识别实际格式…');
  assert.equal(view.status, 'pending');
});





