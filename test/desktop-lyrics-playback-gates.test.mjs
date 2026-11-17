// Pure exact-source gate replay only: never imports/starts Electron, builds, or touches out/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const harnessPath = new URL('../tools/test-wmusic-lyrics-playback.mjs', import.meta.url);
const source = readFileSync(harnessPath, 'utf8');
const primaryUrl = new URL('../out/renderer/index.html', import.meta.url).href;
const overlayUrl = new URL('../out/renderer/desktop-lyrics.html', import.meta.url).href;

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `Maintained gate start missing: ${startMarker}`);
  assert.equal(source.indexOf(startMarker, start + startMarker.length), -1, `Ambiguous maintained gate: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `Maintained gate end missing: ${endMarker}`);
  return source.slice(start, end);
}

// Execute the real observer, its source fixtures and its real source/word/clock assertions.
// Only native/SDK I/O is replayed. No copied acceptance or observer implementation.
const fixtureSource = between('const fixtures =', 'async function inventory(');
const frameAssertionSource = between('function assertSourceFrame(', 'async function settledSource(');
const observerSource = between('async function backgroundObservation(', 'function controlGeometry(');

async function replayBackground(mode, { effective = true, configured = 'default', mutate = () => {} } = {}) {
  const trace = { driverCommands: [], primaryReads: 0, frameReads: 0, screenshots: 0, restores: 0, sleeps: [], frameReadPrimaryFlags: [] };
  const context = vm.createContext({ assert });
  vm.runInContext(`${fixtureSource}\n${frameAssertionSource}\n${observerSource}`, context);
  const fixture = vm.runInContext('sourceFixture("A")', context);
  const at = Date.now(), beforeSeconds = 0.8;
  const audio = currentTime => ({ source: 'A', currentTime, native: true, muted: false, paused: false, rate: 1 });
  const sample = (currentTime, visibility, focused) => ({ sampledAtMs: at, audioConstructions: 1, audio: [audio(currentTime)], visibility, focused });
  const before = sample(beforeSeconds, 'visible', true), after = sample(beforeSeconds + 7.8, 'hidden', false);
  const frames = Array.from({ length: 12 }, (_, index) => {
    const elapsedMs = (index + 1) * 650, positionMs = beforeSeconds * 1000 + elapsedMs;
    const currentIndex = fixture.lyrics.lines.findLastIndex(line => line.timeMs <= positionMs);
    const current = fixture.lyrics.lines[currentIndex], next = fixture.lyrics.lines[currentIndex + 1] || null;
    const word = current.segments?.findLastIndex(mark => mark.timeMs <= positionMs) ?? -1;
    return {
      observedAtMs: at + elapsedMs,
      audioBefore: null, audioAfter: null,
      native: { shown: true, preferences: { showTranslation: true, wordHighlight: true }, snapshot: {
        epoch: 1, generation: 1, track: { key: 'g:1', title: fixture.track.title, artist: fixture.track.artists[0].name },
        current, next, anchor: { receivedAtMs: at + elapsedMs, positionMs, rate: 1, playing: true },
      } },
      dom: { current: current.text, secondary: current.translation, title: `${fixture.track.title} · ${fixture.track.artists[0].name}`,
        word, wordText: current.segments?.[word]?.text || null, wordCount: word >= 0 ? current.segments.length : 0,
        sampledAtMs: at + elapsedMs, stale: 'false' },
    };
  });
  const data = { before, after, frames };
  mutate(data);
  context.seed = JSON.stringify(data);
  vm.runInContext('var replay = JSON.parse(seed); var report = { background: [] };', context);

  let visible = true, minimized = false;
  const main = {
    webContents: { getURL: () => primaryUrl, getBackgroundThrottling: () => effective,
      getLastWebPreferences: () => ({ backgroundThrottling: configured === 'default' ? undefined : configured }) },
    hide: () => { visible = false; }, minimize: () => { minimized = true; },
    isVisible: () => visible, isMinimized: () => minimized,
    restore: () => { minimized = false; trace.restores++; }, show: () => { visible = true; trace.restores++; },
  };
  const lyric = { webContents: { getURL: () => overlayUrl }, isVisible: () => true };
  const driver = { send: async (name, args) => { trace.driverCommands.push({ name, args }); } };
  Object.assign(context, {
    primaryUrl, overlayUrl, primaryId: 1,
    primaryPage: { isClosed: () => false, _connection: { toImpl: () => ({ delegate: { _mainFrameSession: { _client: driver } } }) } },
    bounded: async promise => promise,
    pause: async () => {}, seek: async () => {}, play: async () => {}, settledSource: async () => {},
    sleep: async ms => { trace.sleeps.push(ms); }, screenshot: async () => { trace.screenshots++; },
    primary: async () => {
      trace.primaryReads++;
      assert.ok(trace.primaryReads <= 2, 'Unexpected primary JS read in replay');
      return trace.primaryReads === 1 ? context.replay.before : context.replay.after;
    },
    sourceFrame: async (_name, includePrimary) => {
      trace.frameReadPrimaryFlags.push(includePrimary);
      assert.equal(trace.primaryReads, 1, 'Primary JS was evaluated inside the observation interval');
      assert.equal(includePrimary, false, 'Background interval must only observe overlay/native state');
      return context.replay.frames[trace.frameReads++];
    },
    instance: { evaluate: async (fn, argument) => fn({ BrowserWindow: {
      fromId: id => { assert.equal(id, 1); return main; }, getAllWindows: () => [main, lyric],
    } }, argument) },
  });
  let value, error;
  try { value = await vm.runInContext(`backgroundObservation(${JSON.stringify(mode)})`, context); }
  catch (caught) { error = caught; }
  return { completed: !error, value, error, trace: JSON.parse(JSON.stringify(trace)), observations: context.report.background };
}

function backgroundSummary(observations) {
  const step = between('  await run(6, async () => {', '  await run(7, async () => {');
  const expression = step.match(/return (\{ observations: report\.background\.map.+\});$/m)?.[1];
  assert.ok(expression, 'Actual background step summary missing');
  return vm.runInNewContext(`(${expression})`, { report: { background: observations } });
}

for (const mode of ['hidden', 'minimized']) {
  test(`background ${mode}: disabled effective throttling must reject actual observer`, async () => {
    const result = await replayBackground(mode, { effective: false, configured: false });
    assert.equal(result.completed, false, `Actual observer falsely passed with effective/configured throttling=false: ${JSON.stringify(result.value)}`);
    assert.match(result.error.message, /effective.*background.*throttling/i);
    assert.equal(result.observations[0].backgroundThrottling, false, 'Keep the rejected raw native observation');
    assert.equal(result.observations[0].configuredBackgroundThrottling, false);
    assert.equal(result.trace.frameReads, 0, 'Reject disabled scheduling before the measurement interval');
    assert.ok(result.trace.restores > 0, 'Rejected observation must still restore the exact native primary');
  });
}

test('background summary cannot claim production throttling unchanged for false native observations', () => {
  const observations = ['hidden', 'minimized'].map(mode => ({ mode, frames: [], backgroundThrottling: false, configuredBackgroundThrottling: false }));
  assert.equal(backgroundSummary(observations).productionThrottlingUnmodified, false);
});

const labelsSource = between('const labels = epochDiagnostic ?', 'const report =');
const reportSource = between('const report = { scope:', 'const env =');
const acceptanceSource = between('  report.processes = pidRecord;', '  if (!report.accepted) process.exitCode = 1;');

function replayAcceptance(mode, mutate = () => {}) {
  const context = vm.createContext({ epochDiagnostic: mode === 'epoch-only', primaryUrl, overlayUrl,
    root: 'pure-replay-only', scratch: 'pure-replay-only', profile: 'pure-replay-only', runtime: 'pure-replay-only',
    pidRecord: { exitedNaturally: true, forcedCleanup: false } });
  vm.runInContext(`${labelsSource}\n${reportSource}\n
    report.passed = labels.slice(); report.steps = labels.map(label => ({ label, status: 'passed' }));
    report.outUnchanged = true; report.processExited = true; report.profileRemoved = true; report.runtimeRemoved = true;
  `, context);
  const report = vm.runInContext('report', context);
  mutate(report, context.pidRecord);
  vm.runInContext(acceptanceSource, context);
  return report;
}

for (const mode of ['full11', 'epoch-only']) {
  test(`acceptance ${mode}: unexpected console sentinel must reject actual final predicate`, () => {
    const report = replayAcceptance(mode, report => report.consoleErrors.push({ url: primaryUrl, message: 'SYNTHETIC unexpected console error sentinel' }));
    assert.equal(report.accepted, false, `Actual final predicate accepted unexpected console diagnostic in ${mode}`);
  });

  test(`acceptance ${mode}: unexpected main sentinel must reject actual final predicate`, () => {
    const report = replayAcceptance(mode, report => report.mainErrors.push('SYNTHETIC unexpected main error sentinel'));
    assert.equal(report.accepted, false, `Actual final predicate accepted unexpected main diagnostic in ${mode}`);
  });
}

// Adjacent controls below are naturally green on the bounded fix; they are not additional RED claims.
for (const mode of ['hidden', 'minimized']) {
  for (const configured of ['default', true]) {
    test(`background ${mode}: enabled effective throttling with configuration=${configured} preserves the real interval gates`, async () => {
      const result = await replayBackground(mode, { configured });
      assert.equal(result.completed, true, result.error?.stack);
      assert.equal(result.trace.primaryReads, 2, 'Only one pre-interval and one post-interval primary sample');
      assert.equal(result.trace.frameReads, 12);
      assert.deepEqual(result.trace.frameReadPrimaryFlags, Array(12).fill(false));
      assert.deepEqual(result.trace.driverCommands, [{ name: 'Emulation.setFocusEmulationEnabled', args: { enabled: false } }]);
      assert.equal(result.trace.screenshots, 1);
      assert.equal(result.value.automationFocusOverrideDisabled, true);
      assert.equal(result.value.after.visibility, 'hidden');
      assert.equal(result.value.after.focused, false);
    });
  }

  test(`background ${mode}: effective=true cannot override explicitly disabled configuration`, async () => {
    const result = await replayBackground(mode, { effective: true, configured: false });
    assert.equal(result.completed, false);
    assert.match(result.error.message, /configured background throttling/);
    assert.equal(result.trace.frameReads, 0);
    assert.ok(result.trace.restores > 0);
  });

  for (const effective of [null, 0, 'true']) {
    test(`background ${mode}: non-true effective value=${String(effective)} cannot certify scheduling`, async () => {
      const result = await replayBackground(mode, { effective });
      assert.equal(result.completed, false);
      assert.match(result.error.message, /effective native background throttling/);
      assert.equal(result.trace.frameReads, 0);
    });
  }

  for (const [name, mutate, message] of [
    ['freshness at the exact 1500ms boundary', data => { data.frames[0].native.snapshot.anchor.receivedAtMs -= 1500; }, /beyond 1\.5s/],
    ['DOM made visible by automation', data => { data.after.visibility = 'visible'; }, /must not be made visible/],
    ['automation-faked DOM focus', data => { data.after.focused = true; }, /must not fake primary focus/],
    ['stopped native Audio clock', data => { data.after.audio[0].currentTime = data.before.audio[0].currentTime; }, /must really advance/],
    ['a second native Audio', data => { data.after.audioConstructions = 2; }, /Expected values/],
    ['forced element mute', data => { data.before.audio[0].muted = true; }, /unchanged native Audio mute state/],
    ['stale overlay DOM', data => { data.frames[0].dom.stale = 'true'; }, /overlay became stale/],
    ['wrong committed source identity', data => { data.frames[0].native.snapshot.track.title = 'SYNTHETIC wrong source'; }, /actual Audio source/],
    ['fabricated highlighted word', data => { data.frames[0].dom.wordText = 'SYNTHETIC word'; }, /source-provided mark/],
  ]) {
    test(`background ${mode}: adjacent ${name} still rejects`, async () => {
      const result = await replayBackground(mode, { mutate });
      assert.equal(result.completed, false);
      assert.match(result.error.message, message);
      assert.ok(result.trace.restores > 0);
    });
  }
}

test('background summary derives true only from both enabled native observations', () => {
  const observations = ['hidden', 'minimized'].map(mode => ({ mode, frames: [], backgroundThrottling: true, configuredBackgroundThrottling: 'default' }));
  assert.equal(backgroundSummary(observations).productionThrottlingUnmodified, true);
  observations[1].configuredBackgroundThrottling = false;
  assert.equal(backgroundSummary(observations).productionThrottlingUnmodified, false);
  assert.equal(backgroundSummary(observations.slice(0, 1)).productionThrottlingUnmodified, false);
  assert.equal(backgroundSummary([]).productionThrottlingUnmodified, false);
});

const knownWarning = "The Content Security Policy directive 'frame-ancestors' is ignored when delivered via a <meta> element.";
for (const mode of ['full11', 'epoch-only']) {
  test(`acceptance ${mode}: clean result retains its separate exact case count and scope`, () => {
    const report = replayAcceptance(mode);
    assert.equal(report.accepted, true);
    assert.equal(report.completedCases, mode === 'full11' ? 11 : 1);
    assert.equal(new Set(report.plannedCases).size, report.completedCases);
    assert.match(report.mode, mode === 'full11' ? /^full 11-case Audio acceptance$/ : /diagnostic; NOT full 11-case/);
  });

  test(`acceptance ${mode}: three exact owned-primary warnings remain raw and explicitly classified`, () => {
    let raw;
    const report = replayAcceptance(mode, report => {
      report.consoleErrors.push(...Array.from({ length: 3 }, () => ({ url: primaryUrl, message: knownWarning })));
      raw = report.consoleErrors;
    });
    assert.equal(report.accepted, true);
    assert.equal(report.consoleErrors, raw, 'Do not replace or clear the raw diagnostic array');
    assert.equal(report.consoleErrors.length, 3);
    assert.equal(report.consoleDiagnostics.knownWarnings.length, 3);
    assert.equal(report.consoleDiagnostics.unexpectedErrors.length, 0);
    for (const [index, entry] of raw.entries()) assert.equal(report.consoleDiagnostics.knownWarnings[index], entry);
  });

  for (const [name, diagnostic] of [
    ['exact message from the overlay', { url: overlayUrl, message: knownWarning }],
    ['exact message from a blank containment document', { url: 'about:blank', message: knownWarning }],
    ['exact message from another document', { url: 'file:///synthetic-unowned/index.html', message: knownWarning }],
    ['primary URL with a query suffix', { url: primaryUrl + '?synthetic=1', message: knownWarning }],
    ['known message with extra suffix', { url: primaryUrl, message: knownWarning + ' SYNTHETIC unexpected suffix' }],
    ['known message without its exact punctuation', { url: primaryUrl, message: knownWarning.slice(0, -1) }],
    ['unrelated CSP failure', { url: primaryUrl, message: "Refused to load SYNTHETIC resource because it violates Content Security Policy directive 'script-src'." }],
    ['missing owned document context', { message: knownWarning }],
  ]) {
    test(`acceptance ${mode}: adjacent ${name} is not allowlisted`, () => {
      const report = replayAcceptance(mode, report => report.consoleErrors.push(diagnostic));
      assert.equal(report.accepted, false);
      assert.equal(report.consoleErrors[0], diagnostic);
      assert.equal(report.consoleDiagnostics.knownWarnings.length, 0);
      assert.equal(report.consoleDiagnostics.unexpectedErrors[0], diagnostic);
    });
  }

  test(`acceptance ${mode}: known warnings cannot conceal an unexpected console diagnostic`, () => {
    const unexpected = { url: primaryUrl, message: 'SYNTHETIC unexpected error alongside known warning' };
    const report = replayAcceptance(mode, report => report.consoleErrors.push({ url: primaryUrl, message: knownWarning }, unexpected));
    assert.equal(report.accepted, false);
    assert.equal(report.consoleErrors.length, 2);
    assert.equal(report.consoleDiagnostics.knownWarnings.length, 1);
    assert.equal(report.consoleDiagnostics.unexpectedErrors[0], unexpected);
  });

  test(`acceptance ${mode}: the known console warning is never exempted as a main error`, () => {
    const report = replayAcceptance(mode, report => report.mainErrors.push(knownWarning));
    assert.equal(report.accepted, false);
    assert.equal(report.mainErrors[0], knownWarning);
  });

  for (const [name, mutate] of [
    ['fatal assertion error', report => report.errors.push('SYNTHETIC fatal error')],
    ['renderer exception', report => report.rendererErrors.push({ message: 'SYNTHETIC renderer exception' })],
    ['incomplete case count', report => report.passed.pop()],
    ['excess case count', report => report.passed.push('SYNTHETIC extra case')],
    ['output byte drift', report => { report.outUnchanged = false; }],
    ['live owned process', report => { report.processExited = false; }],
    ['unremoved owned profile', report => { report.profileRemoved = false; }],
    ['unremoved owned runtime', report => { report.runtimeRemoved = false; }],
    ['non-natural quit', (_report, pid) => { pid.exitedNaturally = false; }],
    ['forced cleanup', (_report, pid) => { pid.forcedCleanup = true; }],
  ]) {
    test(`acceptance ${mode}: adjacent ${name} still rejects`, () => {
      assert.equal(replayAcceptance(mode, mutate).accepted, false);
    });
  }
}
