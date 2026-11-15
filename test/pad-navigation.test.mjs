import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
const target = new URL('../src/renderer/pad-navigation.mjs', import.meta.url);
const model = existsSync(target) ? await import(target) : {};

test('Pad navigation has the exact five primary destinations in reference order', () => {
  assert.ok(Array.isArray(model.PAD_TABS), 'Pad navigation is not implemented');
  assert.deepEqual(model.PAD_TABS.map(({ id, label }) => [id, label]), [
    ['home', '首页'], ['hall', '音乐厅'], ['player', '现在就听'], ['cafe', 'café听'], ['mine', '我的'],
  ]);
});

test('secondary library routes select 我的 and playback takes precedence without losing the route', () => {
  assert.equal(typeof model.activePadTab, 'function', 'route mapping is not implemented');
  for (const route of ['favorites','playlists','playlist','history','settings','login','mine']) assert.equal(model.activePadTab(route, false), 'mine');
  for (const route of ['home','hall','cafe']) assert.equal(model.activePadTab(route, false), route);
  assert.equal(model.activePadTab('search', false), 'home');
  assert.equal(model.activePadTab('hall', true), 'player');
  assert.equal(model.activePadTab('hall', false), 'hall');
});
