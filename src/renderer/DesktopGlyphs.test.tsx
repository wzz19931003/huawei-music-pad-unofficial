import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as icons from './PadIcons';

const manifest = JSON.parse(readFileSync(new URL('../../test/fixtures/desktop-glyphs.json', import.meta.url), 'utf8'));
const cases: [keyof typeof icons, Record<string, unknown>, string][] = [
  ['Home', { selected: true }, 'homeSelectedOutline'], ['Home', { selected: false }, 'homeUnselectedOutline'],
  ['Landmark', {}, 'musicHall'], ['Music2', {}, 'organicNoteDiscDock'], ['RadioTower', {}, 'broadcastCafe'], ['CircleUserRound', {}, 'userDisc'],
  ['Star', { selected: true }, 'selectedStar'], ['Star', { selected: false }, 'unselectedStar'],
  ['ListMusic', { variant: 'sleeve' }, 'playlistBook'], ['ListMusic', { variant: 'sleeve', selected: true }, 'playlistBookSelected'],
  ['Mic2', {}, 'singerMic'], ['Mic2', { selected: true }, 'singerMicSelected'], ['Trophy', {}, 'trophy'], ['Trophy', { selected: true }, 'trophySelected'],
  ['Shapes', {}, 'categoryPage'], ['Shapes', { selected: true }, 'categoryPageSelected'],
  ['Play', { variant: 'badge' }, 'playOrganicBadge'], ['Pause', { variant: 'badge' }, 'pauseOrganicBadge'],
  ['Play', {}, 'playPlain'], ['Pause', {}, 'pausePlain'], ['SkipForward', {}, 'next'], ['SkipBack', {}, 'previous'],
  ['MoreVertical', {}, 'circleMore'], ['Heart', { fill: 'none' }, 'favoriteOutline'], ['Heart', { fill: 'currentColor' }, 'favoriteFilled'],
  ['Menu', {}, 'menu'], ['Search', {}, 'search'], ['Shuffle', {}, 'shuffle'], ['ListMusic', {}, 'queueNote'],
];
const paths = (svg: string) => [...svg.matchAll(/\sd="([^"]*)"/g)].map(match => match[1]);

describe('round-one control geometry integration', () => {
  it.each(cases)('maps %s %j to %s without changing the exported icon API', (name, props, key) => {
    const expected = manifest.glyphs[key];
    const html = renderToStaticMarkup(React.createElement(icons[name], props));
    expect(html).toContain(`data-control-glyph="${key}"`);
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain(`stroke-width="${expected.strokeWidth}"`);
    expect(html).toContain(`data-icon-source="${expected.source === 'observed' ? 'screenshot' : 'original'}"`);
    expect(paths(html)).toEqual(paths(expected.svg));
    expect(html).not.toMatch(/<image|<use|<foreignObject| selected=/);
  });

  it('retains all 29 evidence identities and removes consumer stroke-width overrides', () => {
    expect(cases).toHaveLength(manifest.glyphCount);
    expect(new Set(cases.map(([, , key]) => key)).size).toBe(manifest.glyphCount);
    for (const file of ['pad.css', 'pad-screens.css']) {
      const css = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      for (const selector of ['.pad-control > svg', '.pad-play-toggle > svg', '.pad-song-heart svg']) {
        const rule = css.split('}').find(text => text.trim().startsWith(selector));
        expect(rule ?? '').not.toContain('stroke-width');
      }
    }
    const filled = renderToStaticMarkup(<icons.Heart fill="currentColor" />);
    expect(filled).toMatch(/data-part="favorite-heart"[^>]*stroke="none"/);
  });
});
