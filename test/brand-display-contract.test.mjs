import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../package.json'));
const lock = JSON.parse(read('../package-lock.json'));

test('the display-brand follow-up has its own 0.2.2 application version', () => {
  assert.equal(pkg.version, '0.2.2');
});

test('the release lock metadata agrees on version 0.2.2', () => {
  assert.deepEqual([lock.version, lock.packages[''].version], ['0.2.2', '0.2.2']);
});

test('Linux launcher displays Wmusic without changing its executable or desktop-file identity', () => {
  assert.equal(pkg.build.linux.desktop.entry.Name, 'Wmusic');
  assert.equal(pkg.build.linux.executableName, 'huawei-music-desktop');
  assert.equal(pkg.desktopName, 'huawei-music-desktop.desktop');
});

test('package descriptions retain third-party identity and rights boundaries without a display suffix', () => {
  assert.doesNotMatch(pkg.description, /非官方/);
  assert.match(pkg.description, /独立第三方/);
  assert.match(pkg.description, /与华为无隶属、合作或授权关系/);
  assert.match(pkg.description, /需自备账号与会员/);
  assert.match(pkg.description, /不提供音源/);
  assert.equal(pkg.build.linux.synopsis, 'Wmusic: independent third-party Huawei Music client');
  assert.equal(pkg.build.linux.desktop.entry.Comment, '独立第三方客户端，与华为无隶属、合作或授权关系');
});

test('the current contribution policy uses Wmusic while requiring identity disclosure', () => {
  const agents = read('../AGENTS.md');
  assert.match(agents, /主显示名统一为 Wmusic/);
  assert.match(agents, /关于页和文档.*独立第三方.*无隶属、合作或授权关系/);
  assert.doesNotMatch(agents, /显示名必须始终带「非官方」/);
});

test('window, tray and renderer title retain their shared display-name wiring', () => {
  const main = read('../src/main/index.ts');
  const renderer = read('../src/renderer/main.tsx');
  assert.match(main, /import \{ APP_DISPLAY_NAME \} from '\.\.\/shared\/app-name\.mjs'/);
  assert.match(main, /title: APP_DISPLAY_NAME/);
  assert.match(main, /tray\.setToolTip\(APP_DISPLAY_NAME\)/);
  assert.match(renderer, /document\.title = APP_DISPLAY_NAME/);
});
