import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PadPlayer } from './PadPlayer';
import type { usePlayer } from './lib/player';
type Player = ReturnType<typeof usePlayer>;
const render = (patch: Partial<Player>) => {
  const player = { current: { id: 'quality-fixture', title: '合成音质测试', artists: [], available: true }, volume: .6,
    playing: false, buffering: false, duration: 100, position: 0, lyrics: null, favorite: false, mode: 'all',
    actualQuality: 'unknown', quality: 'lossless', playbackDetails: null, heartStatus: 'idle', heartMessage: '',
    toggle: vi.fn(), next: vi.fn(), previous: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), toggleFavorite: vi.fn(),
    selectMode: vi.fn(), cancelHeart: vi.fn(), ...patch } as unknown as Player;
  return renderToStaticMarkup(<PadPlayer player={player} open onOpen={vi.fn()} onClose={vi.fn()} queueOpen={false} onToggleQueue={vi.fn()} />);
};
it('the displayed FLAC badge includes its actual evidence and parsed stream details', () => {
  const html = render({ actualQuality: 'lossless', playbackDetails: { codec: 'flac', qualityEvidence: 'media-bytes', sampleRateHz: 48000, bitDepth: 24, channels: 2 } });
  expect(html).toContain('data-quality-state="confirmed"');
  for (const part of ['无损音质 · FLAC', '媒体数据帧', '48 kHz', '24 bit', '2 声道']) expect(html).toContain(part);
});
