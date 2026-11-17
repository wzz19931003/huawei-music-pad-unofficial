#!/usr/bin/env node
/**
 * TEST ONLY. Native Electron HTTP-client fixtures, NEVER the production app.
 * Usage (no install/build):
 * node tools/test-wmusic-network-security.mjs --runtime-root <candidate> \
 *   --scratch-root <designated-scratch>/native-network --openssl <openssl.exe>
 *
 * Explicit runtime root anchors Electron, Playwright, external and node-gyp Undici.
 * A completed measurement may have operationSucceeded:true, securityAccepted:false.
 * Real wrong-SRI acceptance is a SECURITY FAIL and exits 1, never an expected pass.
 * Pure imports open no network/processes. --help also has no runtime side effects.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const FIXTURE_BODY = 'wmusic synthetic network fixture\n';
const AUTH = 'Bearer WMUSIC_SYNTHETIC_AUTH_ONLY';
const COOKIE = 'wmusic_synthetic_cookie=only-fixture';
const runFile = promisify(execFile);
const sleep = ms => new Promise(done => setTimeout(done, ms));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function requiredCases() {
  const specs = [];
  for (const phase of ['before-global-dispatcher', 'after-global-dispatcher']) {
    for (const client of ['builtin', 'external']) {
      for (const vector of ['correct', 'wrong-normal', 'wrong-space', 'wrong-tab', 'wrong-lf', 'wrong-ff', 'wrong-cr', 'correct-tab', 'correct-ascii-whitespace']) {
        specs.push({ id: `${client}/${phase}/sri/${vector}`, kind: 'sri', client, phase, vector, valid: vector.startsWith('correct') });
      }
    }
  }
  for (const client of ['builtin', 'external']) {
    for (const mode of ['same-origin-auth', 'cross-origin-auth', 'error', 'manual', 'loop']) specs.push({ id: `${client}/redirect/${mode}`, kind: 'redirect', client, mode });
    for (const mode of ['untrusted', 'trusted-positive', 'hostname-mismatch']) specs.push({ id: `${client}/tls/${mode}`, kind: 'tls', client, mode });
    for (const mode of ['explicit-proxy', 'explicit-no-proxy']) specs.push({ id: `${client}/proxy/${mode}`, kind: 'proxy', client, mode });
    for (const mode of ['abort', 'body-cancel']) specs.push({ id: `${client}/cleanup/${mode}`, kind: 'body-cleanup', client, mode });
  }
  for (const client of ['electron-net', 'chromium']) {
    for (const mode of ['basic', 'untrusted-tls']) specs.push({ id: `${client}/${mode}`, kind: 'native-basic', client, mode });
  }
  return specs;
}

export function assessObservation(spec, observation) {
  if (!spec || !observation || observation.harnessError) return false;
  const rejectedFor = expression => observation.fulfilled === false && Array.isArray(observation.error?.chain)
    && observation.error.chain.some(item => item && expression.test(`${item.code || ''} ${item.message || ''}`)) === true;
  const bodyOK = observation.fulfilled === true && observation.status === 200 && observation.body === FIXTURE_BODY;
  if (spec.kind === 'sri') return spec.valid ? bodyOK : rejectedFor(/integrity mismatch/i);
  if (!Array.isArray(observation.wire) || observation.wire.some(row => !row || typeof row !== 'object')) return false;
  if (spec.kind === 'tls') {
    if (spec.mode === 'trusted-positive') return bodyOK && observation.wire?.length === 1;
    return observation.wire?.length === 0 && rejectedFor(spec.mode === 'hostname-mismatch'
      ? /ERR_TLS_CERT_ALTNAME_INVALID/ : /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT_IN_CHAIN|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_AUTHORITY_INVALID/);
  }
  if (spec.kind === 'redirect') {
    const source = observation.wire?.filter(row => row.path === (spec.mode === 'loop' ? '/loop' : '/redirect')) || [];
    const targets = observation.wire?.filter(row => row.path === '/echo') || [];
    if (!source.length || source[0].authorization !== AUTH || source[0].cookie !== COOKIE) return false;
    if (spec.mode === 'error') return targets.length === 0 && rejectedFor(/unexpected redirect/i);
    if (spec.mode === 'manual') return observation.fulfilled === true && observation.status === 302
      && observation.location === observation.expectedLocation && targets.length === 0 && source.length === 1;
    if (spec.mode === 'loop') return targets.length === 0 && source.length >= 2 && source.length <= 21 && rejectedFor(/redirect count exceeded/i);
    if (observation.fulfilled !== true || observation.status !== 200 || targets.length !== 1 || source.length !== 1) return false;
    return spec.mode === 'cross-origin-auth'
      ? targets[0].origin === 'B' && targets[0].authorization === null && targets[0].cookie === null
      : targets[0].origin === 'A' && targets[0].authorization === AUTH && targets[0].cookie === COOKIE;
  }
  if (spec.kind === 'proxy') return bodyOK && observation.wire?.length === 1
    && observation.proxyConnectDelta === (spec.mode === 'explicit-proxy' ? 1 : 0);
  if (spec.kind === 'body-cleanup') return observation.serverStreamClosed === true && observation.prefixRead === true
    && (spec.mode === 'abort' ? rejectedFor(/AbortError|aborted/i) : observation.readerCancelled === true);
  if (spec.kind === 'native-basic') return spec.mode === 'untrusted-tls'
    ? observation.wire?.length === 0 && rejectedFor(/ERR_CERT_AUTHORITY_INVALID/)
    : bodyOK && observation.wire?.length === 1 && (spec.client !== 'chromium' || observation.nodeProcessType === 'undefined');
  return false;
}

export function evaluateReport(value) {
  const report = value && typeof value === 'object' ? value : {};
  const reasons = [];
  if (report.operationSucceeded !== true) reasons.push('measurement operation did not complete');
  for (const section of ['containment', 'provenance', 'unchanged', 'runtimeCleanup', 'cleanup']) {
    if (report[section]?.verified !== true) reasons.push(`${section} not verified`);
  }
  if (report.cleanup?.forcedKill !== false || report.cleanup?.naturalExit !== true) reasons.push('native process did not exit naturally without forced kill');
  if (!Array.isArray(report.diagnostics) || report.diagnostics.length) reasons.push('missing or unclassified diagnostics');
  if (!Array.isArray(report.exclusions)) reasons.push('missing exclusions');
  const expected = requiredCases(), rows = Array.isArray(report.cases) ? report.cases : [];
  const known = new Set(expected.map(spec => spec.id));
  const seen = new Set();
  for (const row of rows) {
    if (!row || !known.has(row.id) || seen.has(row.id)) reasons.push(`unknown/duplicate observation: ${row?.id}`);
    seen.add(row?.id);
  }
  for (const spec of expected) {
    const row = rows.find(item => item?.id === spec.id);
    if (!row || row.executed !== true) reasons.push(`missing observation: ${spec.id}`);
    else if (!assessObservation(spec, row.observation)) reasons.push(`SECURITY FAIL: ${spec.id}`);
  }
  return { securityAccepted: reasons.length === 0, exitCode: reasons.length ? 1 : 0, reasons,
    requiredCases: expected.length, observedCases: rows.length };
}

// Serialized into a fresh scratch .cjs host; it has NO application imports or IPC.
function testOnlyHost(config) {
  const { app, BrowserWindow, session, net: electronNet } = require('electron');
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
  const http = require('node:http'), https = require('node:https'), nodeNet = require('node:net');
  const assert = require('node:assert/strict');
  const candidateRequire = require('node:module').createRequire(path.join(config.runtimeRoot, 'package.json'));
  const BODY = config.body, lifecycle = path.join(config.evidence, 'lifecycle.jsonl');
  const log = value => fs.appendFileSync(lifecycle, JSON.stringify({ ...value, at: new Date().toISOString() }) + '\n');
  const report = { cases: [], diagnostics: [], requests: [], deniedNetwork: [], dispatcherDispatches: [], proxyConnects: [], streamCloses: [] };
  const persist = () => fs.writeFileSync(path.join(config.evidence, 'native-observations.json'), JSON.stringify(report, null, 2) + '\n');
  const errorInfo = error => {
    const chain = [], seen = new Set();
    for (let item = error; item && !seen.has(item) && chain.length < 8; item = item.cause) {
      seen.add(item); chain.push({ name: item.name || null, code: item.code || null, message: String(item.message || item), stack: String(item.stack || '') });
    }
    return { chain };
  };
  const pause = ms => new Promise(done => setTimeout(done, ms));
  const bounded = async (promise, ms, label) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Fixture deadline: ${label}`)), ms); })]); }
    finally { clearTimeout(timer); }
  };
  for (const [name, target] of Object.entries(config.paths)) app.setPath(name, target);
  app.setName('wmusic-network-security-TEST-ONLY');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('no-first-run');
  for (const [name, target] of Object.entries(config.paths)) assert.equal(path.resolve(app.getPath(name)), path.resolve(target), `containment ${name}`);
  for (const name of ['TMP', 'TEMP', 'TMPDIR']) assert.equal(path.resolve(process.env[name]), path.resolve(config.paths.temp));
  assert.equal(process.type, 'browser');
  assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, undefined);
  const nativeSource = process.binding('natives')['internal/deps/undici/undici'];
  report.containment = { verified: true, beforeClientImportOrFixtures: true, paths: Object.fromEntries(Object.keys(config.paths).map(name => [name, app.getPath(name)])),
    tmpEnvironment: Object.fromEntries(['TMP', 'TEMP', 'TMPDIR'].map(name => [name, process.env[name]])) };
  report.identity = { pid: process.pid, ppid: process.ppid, execPath: process.execPath, versions: process.versions, type: process.type,
    argv: process.argv, execArgv: process.execArgv, builtinUndiciSourceSha256: crypto.createHash('sha256').update(nativeSource).digest('hex') };
  fs.writeFileSync(path.join(config.evidence, 'startup.json'), JSON.stringify({ containment: report.containment, identity: report.identity }, null, 2) + '\n');
  process.on('uncaughtException', error => { report.diagnostics.push({ event: 'uncaughtException', error: errorInfo(error) }); persist(); });
  process.on('unhandledRejection', error => { report.diagnostics.push({ event: 'unhandledRejection', error: errorInfo(error) }); persist(); });
  process.on('warning', warning => { report.diagnostics.push({ event: 'warning', error: errorInfo(warning) }); persist(); });
  app.on('window-all-closed', () => {});
  for (const event of ['before-quit', 'will-quit']) app.on(event, () => log({ event, windows: BrowserWindow.getAllWindows().length }));
  app.on('quit', (_event, code) => log({ event: 'quit', code }));
  const allowedOrigins = new Set(), ports = new Set(), sockets = new Set(), servers = [], agents = new Set(), sessions = new Set();
  const originalConnect = nodeNet.Socket.prototype.connect;
  let external, originalDispatcher, installedDispatcher, window, activeCase = null, dispatchCount = 0, started = false;
  const protectedSessions = new WeakSet();
  function protect(ses) {
    if (protectedSessions.has(ses)) return;
    protectedSessions.add(ses); sessions.add(ses);
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, done) => {
      const url = new URL(details.url);
      const permitted = (url.protocol === 'http:' || url.protocol === 'https:') && allowedOrigins.has(url.origin);
      if (!permitted) report.deniedNetwork.push({ layer: 'chromium', url: details.url, case: activeCase });
      done({ cancel: !permitted });
    });
    ses.webRequest.onErrorOccurred({ urls: ['<all_urls>'] }, details => {
      (report.chromiumRequestErrors ||= []).push({ url: details.url, error: details.error, case: activeCase });
    });
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
  }
  app.on('session-created', protect);
  // Cover the real default native/global fetch transport, not just an external Agent.
  nodeNet.Socket.prototype.connect = function (...args) {
    let first = args[0]; if (Array.isArray(first)) first = first[0];
    const opts = first && typeof first === 'object' ? first : { port: first, host: typeof args[1] === 'string' ? args[1] : undefined };
    if (opts.path || opts.host !== '127.0.0.1' || !ports.has(Number(opts.port))) {
      const record = { layer: 'node-socket', host: opts.host || null, port: opts.port || null, path: opts.path || null, case: activeCase };
      report.deniedNetwork.push(record); throw new Error(`TEST-ONLY socket containment rejected ${JSON.stringify(record)}`);
    }
    return originalConnect.apply(this, args);
  };
  const watchdog = setTimeout(() => { report.diagnostics.push({ event: 'host-watchdog' }); persist(); app.quit(); }, 90000);
  watchdog.unref();
  globalThis.__wmusicNetworkProbe = { report, run };

  async function listen(server, name) {
    servers.push({ server, name }); server.maxConnections = 48; server.maxHeadersCount = 32;
    server.requestTimeout = 4000; server.headersTimeout = 4000;
    server.on('connection', socket => {
      if (socket.remoteAddress !== '127.0.0.1' || sockets.size >= 64) { socket.destroy(); report.diagnostics.push({ event: 'fixture-connection-limit-or-peer', name }); return; }
      sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket));
    });
    server.on('error', error => report.diagnostics.push({ event: 'server-error', name, error: errorInfo(error) }));
    server.on('tlsClientError', error => { (report.tlsClientErrors ||= []).push(errorInfo(error)); });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
    const address = server.address(); assert.equal(address.address, '127.0.0.1'); ports.add(address.port);
    const origin = `${name.startsWith('TLS') ? 'https' : 'http'}://127.0.0.1:${address.port}`;
    allowedOrigins.add(origin); return origin;
  }
  function handler(origin) {
    return (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (report.requests.length >= 256 || req.method !== 'GET' || req.headers['content-length'] || req.headers['transfer-encoding']) {
        report.diagnostics.push({ event: 'fixture-request-limit-or-method' }); req.destroy(); return;
      }
      const row = { origin, path: url.pathname, case: url.searchParams.get('case'), method: req.method,
        authorization: req.headers.authorization || null, cookie: req.headers.cookie || null, proxyAuthorization: req.headers['proxy-authorization'] || null };
      report.requests.push(row); req.on('error', () => {}); res.on('error', () => {});
      res.setHeader('Cache-Control', 'no-store');
      if (url.pathname === '/redirect') {
        const target = url.searchParams.get('to') === 'B' ? report.origins.B : report.origins.A;
        res.writeHead(302, { Location: `${target}/echo?case=${encodeURIComponent(row.case)}` }); res.end('synthetic redirect');
      } else if (url.pathname === '/loop') {
        res.writeHead(302, { Location: `${report.origins.A}/loop?case=${encodeURIComponent(row.case)}` }); res.end('synthetic loop');
      } else if (url.pathname === '/echo') {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(row));
      } else if (url.pathname === '/slow') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }); res.write('synthetic prefix\n');
        let count = 0;
        const interval = setInterval(() => { if (++count >= 60) { clearInterval(interval); res.end('bounded end'); } else res.write('synthetic bounded stream\n'); }, 40);
        res.once('close', () => { clearInterval(interval); report.streamCloses.push({ case: row.case, beforeNaturalEnd: count < 60, chunks: count }); });
      } else if (url.pathname === '/page') {
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Security-Policy', "default-src 'none'; connect-src http://127.0.0.1:* https://127.0.0.1:*; script-src 'none'");
        res.end('<!doctype html><meta charset="utf-8"><title>TEST ONLY synthetic network fixture</title>Fixture, no preload, no app.');
      } else if (url.pathname === '/body') {
        res.setHeader('Content-Type', 'text/plain'); res.end(BODY);
      } else { res.writeHead(404); res.end('fixture route missing'); }
    };
  }
  async function consume(response) {
    let reader, total = 0; const pieces = [];
    try {
      if (!response.body) return '';
      reader = response.body.getReader();
      for (;;) {
        const item = await reader.read(); if (item.done) break;
        total += item.value.length; if (total > 65536) throw new Error('Fixture body byte limit'); pieces.push(Buffer.from(item.value));
      }
      return Buffer.concat(pieces).toString('utf8');
    } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
  }
  async function fetchObservation(fetcher, url, options = {}) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3500);
    let response;
    try {
      response = await fetcher(url, { ...options, signal: controller.signal });
      const body = await consume(response);
      return { fulfilled: true, status: response.status, url: response.url, redirected: response.redirected, location: response.headers.get('location'), body, bodyUsed: response.bodyUsed };
    } catch (error) { return { fulfilled: false, error: errorInfo(error) }; }
    finally { clearTimeout(timer); if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {}); }
  }
  async function execute(spec, operation) {
    activeCase = spec.id; const start = Date.now(), before = dispatchCount;
    let observation;
    try { observation = await bounded(operation(), 6000, spec.id); }
    catch (error) { observation = { harnessError: errorInfo(error), fulfilled: false }; }
    if (spec.client === 'chromium' || spec.client === 'electron-net') {
      await pause(40);
      observation.nativeErrors = (report.chromiumRequestErrors || []).filter(row => row.url.includes(`case=${encodeURIComponent(spec.id)}`));
      if (observation.fulfilled === false && observation.error?.chain) for (const item of observation.nativeErrors) {
        observation.error.chain.push({ name: 'ChromiumNetworkError', code: null, message: item.error, source: 'session.webRequest.onErrorOccurred', url: item.url });
      }
    }
    observation.wire = report.requests.filter(row => row.case === spec.id);
    observation.dispatchDelta = dispatchCount - before;
    report.cases.push({ id: spec.id, executed: true, durationMs: Date.now() - start, observation }); persist(); activeCase = null;
  }
  async function run() {
    assert.equal(started, false); started = true;
    try {
      await app.whenReady(); protect(session.defaultSession);
      await session.defaultSession.setProxy({ mode: 'direct' });
      report.proxyResolution = await session.defaultSession.resolveProxy('http://127.0.0.1');
      assert.equal(report.proxyResolution, 'DIRECT');
      const cert = name => fs.readFileSync(path.join(config.certs, name));
      report.origins = {};
      report.origins.A = await listen(http.createServer(handler('A')), 'A');
      report.origins.B = await listen(http.createServer(handler('B')), 'B');
      report.origins.TLS = await listen(https.createServer({ key: cert('valid.key'), cert: cert('valid.crt') }, handler('TLS')), 'TLS');
      report.origins.MISMATCH = await listen(https.createServer({ key: cert('mismatch.key'), cert: cert('mismatch.crt') }, handler('MISMATCH')), 'TLS-MISMATCH');
      const proxy = http.createServer((_req, res) => { report.diagnostics.push({ event: 'unexpected-forward-proxy-request' }); res.writeHead(405); res.end(); });
      proxy.on('connect', (req, socket, head) => {
        const target = new URL(`http://${req.url}`);
        const port = Number(target.port);
        if (target.hostname !== '127.0.0.1' || !ports.has(port) || ![new URL(report.origins.A).port, new URL(report.origins.B).port].includes(target.port)) {
          report.diagnostics.push({ event: 'proxy-target-rejected', target: req.url }); socket.destroy(); return;
        }
        report.proxyConnects.push({ case: activeCase, target: req.url });
        const upstream = nodeNet.connect({ host: '127.0.0.1', port }); sockets.add(upstream);
        upstream.once('close', () => sockets.delete(upstream)); upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy());
        socket.once('close', () => upstream.destroy()); upstream.once('close', () => socket.destroy());
        upstream.once('connect', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket); });
      });
      report.origins.PROXY = await listen(proxy, 'PROXY');
      const builtin = globalThis.fetch;
      const digest = value => crypto.createHash('sha256').update(value).digest('base64');
      const good = `sha256-${digest(BODY)}`, bad = `sha256-${digest('different synthetic body')}`;
      const metadata = { correct: good, 'wrong-normal': bad, 'wrong-space': ` ${bad}`, 'wrong-tab': `\t${bad}`,
        'wrong-lf': `\n${bad}`, 'wrong-ff': `\f${bad}`, 'wrong-cr': `\r${bad}`, 'correct-tab': `\t${good}`, 'correct-ascii-whitespace': `\t\n\f\r ${good} \t\r\n\f` };
      report.integrityMetadata = metadata;
      for (const phase of ['before-global-dispatcher', 'after-global-dispatcher']) {
        if (phase === 'after-global-dispatcher') {
          originalDispatcher = external.getGlobalDispatcher(); agents.add(originalDispatcher);
          installedDispatcher = new external.Agent({ connect: { timeout: 3000 }, headersTimeout: 3500, bodyTimeout: 3500 }); agents.add(installedDispatcher);
          const dispatch = installedDispatcher.dispatch.bind(installedDispatcher);
          installedDispatcher.dispatch = (options, handler) => { dispatchCount++; report.dispatcherDispatches.push({ case: activeCase, origin: String(options.origin), path: options.path }); return dispatch(options, handler); };
          external.setGlobalDispatcher(installedDispatcher);
          report.dispatcherInstallation = { beforeConstructor: originalDispatcher.constructor.name, afterConstructor: external.getGlobalDispatcher().constructor.name,
            installedIdentityVerified: external.getGlobalDispatcher() === installedDispatcher, globalFetchFunctionUnchanged: globalThis.fetch === builtin };
        }
        for (const client of ['builtin', 'external']) {
          if (client === 'external' && !external) {
            const before = globalThis[Symbol.for('undici.globalDispatcher.1')];
            external = candidateRequire('undici');
            report.externalImport = { path: candidateRequire.resolve('undici'), version: candidateRequire('undici/package.json').version,
              legacyDispatcherPreservedOnImport: before === external.getGlobalDispatcher() };
            assert.equal(typeof external.EnvHttpProxyAgent, 'function'); assert.equal(typeof external.Agent, 'function');
          }
          const fetcher = client === 'builtin' ? builtin : external.fetch;
          for (const spec of config.specs.filter(row => row.kind === 'sri' && row.phase === phase && row.client === client)) {
            await execute(spec, async () => ({ ...await fetchObservation(fetcher, `${report.origins.A}/body?case=${encodeURIComponent(spec.id)}`, { integrity: metadata[spec.vector] }), integrity: metadata[spec.vector] }));
          }
        }
      }
      for (const client of ['builtin', 'external']) {
        const fetcher = client === 'builtin' ? builtin : external.fetch;
        for (const spec of config.specs.filter(row => row.client === client && row.kind !== 'sri')) {
          const query = `case=${encodeURIComponent(spec.id)}`;
          await execute(spec, async () => {
            if (spec.kind === 'redirect') {
              const mode = spec.mode, to = mode === 'same-origin-auth' ? 'A' : 'B';
              const url = `${report.origins.A}/${mode === 'loop' ? 'loop' : 'redirect'}?to=${to}&${query}`;
              return { ...await fetchObservation(fetcher, url, { redirect: ['error', 'manual'].includes(mode) ? mode : 'follow', headers: { Authorization: config.auth, Cookie: config.cookie } }),
                expectedLocation: `${report.origins[to]}/echo?case=${encodeURIComponent(spec.id)}` };
            }
            if (spec.kind === 'tls') {
              let dispatcher;
              if (spec.mode !== 'untrusted') { dispatcher = new external.Agent({ connect: { ca: cert('ca.crt'), timeout: 3000 } }); agents.add(dispatcher); }
              return fetchObservation(fetcher, `${spec.mode === 'hostname-mismatch' ? report.origins.MISMATCH : report.origins.TLS}/body?${query}`, dispatcher ? { dispatcher } : {});
            }
            if (spec.kind === 'proxy') {
              const dispatcher = new external.EnvHttpProxyAgent({ httpProxy: report.origins.PROXY, httpsProxy: report.origins.PROXY,
                noProxy: spec.mode === 'explicit-no-proxy' ? `127.0.0.1:${new URL(report.origins.A).port}` : '', connect: { timeout: 3000 } }); agents.add(dispatcher);
              const count = report.proxyConnects.length;
              return { ...await fetchObservation(fetcher, `${report.origins.A}/body?${query}`, { dispatcher }), proxyConnectDelta: report.proxyConnects.length - count };
            }
            if (spec.kind === 'body-cleanup') {
              const controller = new AbortController(); let reader, response, prefixRead = false, result;
              const timer = setTimeout(() => controller.abort(), 3000);
              try {
                response = await fetcher(`${report.origins.A}/slow?${query}`, { signal: controller.signal }); reader = response.body.getReader();
                const prefix = await reader.read(); prefixRead = !prefix.done && Buffer.from(prefix.value).toString().includes('synthetic prefix');
                if (spec.mode === 'abort') {
                  controller.abort();
                  try { await reader.read(); result = { fulfilled: true }; } catch (error) { result = { fulfilled: false, error: errorInfo(error) }; }
                } else { await reader.cancel(); result = { fulfilled: true, readerCancelled: true }; }
              } finally { clearTimeout(timer); if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
              for (let n = 0; n < 80 && !report.streamCloses.some(row => row.case === spec.id); n++) await pause(20);
              return { ...result, prefixRead, serverStreamClosed: report.streamCloses.some(row => row.case === spec.id && row.beforeNaturalEnd) };
            }
            throw new Error(`Unknown fixture: ${spec.id}`);
          });
        }
      }
      const nativeSession = session.fromPartition('wmusic-network-fixture-memory-only', { cache: false }); protect(nativeSession); await nativeSession.setProxy({ mode: 'direct' });
      report.nativeSessionProxy = await nativeSession.resolveProxy(report.origins.A); assert.equal(report.nativeSessionProxy, 'DIRECT');
      for (const spec of config.specs.filter(row => row.client === 'electron-net')) {
        await execute(spec, () => new Promise(done => {
          let complete = false, total = 0; const parts = [];
          const request = electronNet.request({ url: `${spec.mode === 'untrusted-tls' ? report.origins.TLS : report.origins.A}/body?case=${encodeURIComponent(spec.id)}`, session: nativeSession, redirect: 'error' });
          const finish = value => { if (!complete) { complete = true; clearTimeout(timer); done(value); } };
          const timer = setTimeout(() => { request.abort(); finish({ fulfilled: false, error: errorInfo(new Error('Electron request fixture timeout')) }); }, 3500);
          request.on('error', error => finish({ fulfilled: false, error: errorInfo(error) }));
          request.on('response', response => {
            response.on('error', error => finish({ fulfilled: false, error: errorInfo(error) }));
            response.on('data', chunk => { total += chunk.length; if (total > 65536) { request.abort(); finish({ fulfilled: false, harnessError: errorInfo(new Error('Electron body bound')) }); } else parts.push(chunk); });
            response.on('end', () => finish({ fulfilled: true, status: response.statusCode, body: Buffer.concat(parts).toString('utf8') }));
          }); request.end();
        }));
      }
      window = new BrowserWindow({ show: false, width: 480, height: 320, webPreferences: { session: nativeSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
      const handle = window.getNativeWindowHandle();
      const prefs = window.webContents.getLastWebPreferences();
      report.window = { id: window.id, hwnd: handle.length >= 8 ? handle.readBigUInt64LE().toString() : handle.readUInt32LE().toString(),
        webPreferences: Object.fromEntries(['nodeIntegration', 'contextIsolation', 'sandbox', 'webSecurity', 'preload'].map(name => [name, prefs[name] ?? null])) };
      window.webContents.on('render-process-gone', (_event, details) => report.diagnostics.push({ event: 'render-process-gone', details }));
      window.webContents.on('preload-error', (_event, _name, error) => report.diagnostics.push({ event: 'preload-error', error: errorInfo(error) }));
      await bounded(window.loadURL(`${report.origins.A}/page`), 5000, 'test-only Chromium document');
      for (const spec of config.specs.filter(row => row.client === 'chromium')) {
        await execute(spec, () => window.webContents.executeJavaScript(`(async () => {
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 3500);
          try { const response = await fetch(${JSON.stringify(`${spec.mode === 'untrusted-tls' ? report.origins.TLS : report.origins.A}/body?case=${encodeURIComponent(spec.id)}`)}, { signal: controller.signal });
            return { fulfilled: true, status: response.status, body: await response.text(), nodeProcessType: typeof process };
          } catch (error) { return { fulfilled: false, error: { chain: [{ name: error.name, code: error.code || null, message: String(error.message), stack: String(error.stack || '') }] } }; }
          finally { clearTimeout(timer); }
        })()`, false));
      }
      report.processMetrics = app.getAppMetrics().map(row => ({ pid: row.pid, type: row.type }));
      report.operationSucceeded = report.cases.length === config.specs.length;
    } catch (error) { report.diagnostics.push({ event: 'host-operation-error', error: errorInfo(error) }); report.operationSucceeded = false; }
    finally {
      const cleanup = report.runtimeCleanup = { verified: false, agents: [], servers: [], sessions: [], errors: [] };
      if (window && !window.isDestroyed()) window.destroy();
      cleanup.remainingWindows = BrowserWindow.getAllWindows().length;
      for (const ses of sessions) {
        try { await bounded(ses.closeAllConnections(), 2500, 'session close'); await ses.clearStorageData(); await ses.clearCache(); cleanup.sessions.push({ closed: true, storageCleared: true }); }
        catch (error) { cleanup.errors.push({ operation: 'session-close', error: errorInfo(error) }); }
      }
      if (external && originalDispatcher) external.setGlobalDispatcher(originalDispatcher);
      if (external) agents.add(external.getGlobalDispatcher());
      for (const agent of agents) {
        try { await bounded(agent.close(), 2500, 'agent close'); cleanup.agents.push({ class: agent.constructor.name, closed: true }); }
        catch (error) { cleanup.errors.push({ operation: 'agent-close', error: errorInfo(error) }); try { await agent.destroy(); } catch {} }
      }
      for (const { server, name } of servers) {
        try {
          const closing = new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
          server.closeAllConnections?.(); for (const socket of sockets) socket.destroy();
          await bounded(closing, 2500, `server close ${name}`); cleanup.servers.push({ name, listening: server.listening });
        } catch (error) { cleanup.errors.push({ operation: `server-close-${name}`, error: errorInfo(error) }); }
      }
      await pause(100);
      cleanup.openSockets = sockets.size;
      cleanup.ports = [];
      for (const port of ports) {
        const proof = await new Promise(done => {
          const socket = nodeNet.connect({ host: '127.0.0.1', port }); let finished = false;
          const finish = value => { if (finished) return; finished = true; clearTimeout(timer); socket.destroy(); done(value); };
          const timer = setTimeout(() => finish({ port, closed: false, error: 'timeout' }), 600);
          socket.once('connect', () => finish({ port, closed: false })); socket.once('error', error => finish({ port, closed: error.code === 'ECONNREFUSED', error: error.code }));
        }); cleanup.ports.push(proof);
      }
      nodeNet.Socket.prototype.connect = originalConnect;
      clearTimeout(watchdog);
      cleanup.verified = cleanup.errors.length === 0 && cleanup.remainingWindows === 0 && cleanup.openSockets === 0
        && cleanup.servers.length === servers.length && cleanup.servers.every(row => row.listening === false) && cleanup.ports.every(row => row.closed === true);
      log({ event: 'fixture-cleanup', verified: cleanup.verified }); persist();
    }
    return report;
  }
}

async function fileEvidence(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return { path: await fs.realpath(path), bytes: (await fs.stat(path)).size, sha256: hash.digest('hex') };
}
async function inventory(root) {
  const result = [];
  async function walk(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) { const item = await fileEvidence(path); result.push({ path: relative(root, path).split(sep).join('/'), bytes: item.bytes, sha256: item.sha256 }); }
      else throw new Error(`No symlinks/special files permitted in evidence inventory: ${path}`);
    }
  }
  await walk(root); return result.sort((a, b) => a.path.localeCompare(b.path));
}
const inside = (base, target) => { const rel = relative(base, target); return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)); };
async function canonicalScratchPath(path) {
  const target = resolve(path);
  let ancestor = target;
  for (;;) {
    try { return resolve(await fs.realpath(ancestor), relative(ancestor, target)); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      // ENOENT may mean a dangling junction, not an absent directory. Never
      // walk past an existing but unresolvable entry and then write through it.
      const entry = await fs.lstat(ancestor).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      assert.equal(entry, null, 'unresolvable existing scratch ancestor');
      const parent = dirname(ancestor);
      assert.notEqual(parent, ancestor, 'no canonical scratch ancestor');
      ancestor = parent;
    }
  }
}
async function validateScratchRoots(protectedRoots, roots) {
  for (const path of protectedRoots) assert.equal(await fs.realpath(path), path, 'protected root canonical path changed');
  for (const path of roots.filter(Boolean)) {
    const canonical = await fs.realpath(path);
    assert.equal(canonical, path, 'scratch canonical path changed');
    assert.ok(protectedRoots.every(base => !inside(base, canonical)), 'all generated files must be outside repo/runtime-root');
  }
}
async function governedInventory(repo) {
  const branding = ['build/icon-src.png', 'build/icon.LICENSE.txt', 'build/icon.ico', 'build/icon.png', 'build/tray.png', 'src/renderer/assets/app-icon.png'];
  const root = ['package.json', 'package-lock.json', 'electron.vite.config.ts'];
  return { src: await inventory(join(repo, 'src')), out: await inventory(join(repo, 'out')),
    approved6: await Promise.all(branding.map(async name => ({ name, ...await fileEvidence(join(repo, name)) }))),
    root: await Promise.all(root.map(async name => ({ name, ...await fileEvidence(join(repo, name)) }))) };
}
async function dependencyIdentity(runtimeRoot) {
  const request = createRequire(join(runtimeRoot, 'package.json'));
  const electronPackage = request.resolve('electron/package.json');
  const externalPackage = request.resolve('undici/package.json');
  const nodeGypPackage = request.resolve('node-gyp/package.json');
  const nodeGypRequest = createRequire(nodeGypPackage), nestedPackage = nodeGypRequest.resolve('undici/package.json');
  const executable = await fs.realpath(request('electron'));
  const playwrightPackage = request.resolve('playwright-core/package.json');
  for (const path of [electronPackage, externalPackage, nodeGypPackage, nestedPackage, executable, playwrightPackage]) assert.ok(inside(runtimeRoot, await fs.realpath(path)), `runtime-root anchor escaped: ${path}`);
  assert.notEqual(externalPackage, nestedPackage, 'node-gyp copy must resolve independently');
  const describe = async path => {
    const pkg = JSON.parse(await fs.readFile(path, 'utf8')), entries = await inventory(dirname(path));
    return { version: pkg.version, manifest: await fileEvidence(path), treeSha256: sha(JSON.stringify(entries)), files: entries };
  };
  return { electron: { version: JSON.parse(await fs.readFile(electronPackage, 'utf8')).version, manifest: await fileEvidence(electronPackage), executable: await fileEvidence(executable) },
    external: { ...await describe(externalPackage), entry: await fileEvidence(request.resolve('undici')) },
    nodeGypUndici: { ...await describe(nestedPackage), entry: await fileEvidence(nodeGypRequest.resolve('undici')), owner: await fileEvidence(nodeGypPackage) },
    playwright: { manifest: await fileEvidence(playwrightPackage), coreBundle: await fileEvidence(join(dirname(playwrightPackage), 'lib/coreBundle.js')) },
    discovery: { electronDts: await fileEvidence(join(dirname(electronPackage), 'electron.d.ts')),
      proxyDocs: await fileEvidence(join(dirname(externalPackage), 'docs/docs/api/EnvHttpProxyAgent.md')),
      proxyImplementation: await fileEvidence(join(dirname(externalPackage), 'lib/dispatcher/env-http-proxy-agent.js')),
      globalDispatcher: await fileEvidence(join(dirname(externalPackage), 'lib/global.js')),
      connector: await fileEvidence(join(dirname(externalPackage), 'lib/core/connect.js')),
      sriImplementation: await fileEvidence(join(dirname(externalPackage), 'lib/web/fetch/util.js')) } };
}
function childEnvironment(paths, home) {
  const result = {};
  for (const key of Object.keys(process.env)) if (['path', 'systemroot', 'windir', 'comspec', 'pathext', 'os', 'processor_architecture', 'number_of_processors', 'systemdrive'].includes(key.toLowerCase())) result[key] = process.env[key];
  return { ...result, HOME: home, USERPROFILE: home, APPDATA: paths.appData, LOCALAPPDATA: join(home, 'local'),
    TMP: paths.temp, TEMP: paths.temp, TMPDIR: paths.temp };
}
async function createCertificates(openssl, certs, env, report) {
  const commands = [];
  const command = async args => {
    const result = await runFile(openssl, args, { cwd: certs, env, timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 });
    commands.push({ args, exitCode: 0, stdout: result.stdout, stderr: result.stderr });
  };
  report.certificates = { commands, privateKeysNeverPrintedOrPersistedInReports: true, trustScope: 'per-Undici-Agent ca only; no OS trust changes, no TLS validation disable' };
  await fs.writeFile(join(certs, 'fixture-openssl.cnf'), '[req]\nprompt=no\ndistinguished_name=fixture_dn\n[fixture_dn]\nCN=wmusic-TEST-ONLY\n');
  await command(['version']);
  await command(['req', '-config', 'fixture-openssl.cnf', '-x509', '-newkey', 'rsa:2048', '-noenc', '-sha256', '-days', '1', '-subj', '/CN=wmusic-TEST-ONLY-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', 'ca.key', '-out', 'ca.crt']);
  for (const [name, san] of [['valid', 'DNS:wmusic-fixture.invalid,IP:127.0.0.1'], ['mismatch', 'DNS:wmusic-other-fixture.invalid']]) {
    await fs.writeFile(join(certs, `${name}.ext`), `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`);
    await command(['req', '-config', 'fixture-openssl.cnf', '-new', '-newkey', 'rsa:2048', '-noenc', '-sha256', '-subj', `/CN=wmusic-${name}-TEST-ONLY`, '-keyout', `${name}.key`, '-out', `${name}.csr`]);
    await command(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-sha256', '-days', '1', '-extfile', `${name}.ext`, '-out', `${name}.crt`]);
  }
  report.certificates.publicFingerprints = await Promise.all(['ca.crt', 'valid.crt', 'mismatch.crt'].map(name => fileEvidence(join(certs, name))));
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } };
// PID hints from the child/inspector are liveness evidence, NOT creation identities
// or authority to signal. Query only these PIDs; never discover owners by substring.
async function observedWindowsProcesses(pids) {
  const ids = [...pids];
  assert.ok(ids.every(pid => Number.isSafeInteger(pid) && pid > 0), 'invalid observed PID');
  if (!ids.length) return [];
  const filter = ids.map(pid => `ProcessId = ${pid}`).join(' OR ');
  const script = `@(Get-CimInstance Win32_Process -Filter '${filter}' | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CreationDate) | ConvertTo-Json -Compress`;
  const { stdout } = await runFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { timeout: 15000, windowsHide: true });
  const value = stdout.trim() ? JSON.parse(stdout.trim()) : [];
  const rows = Array.isArray(value) ? value : [value];
  assert.ok(rows.every(row => row && ids.includes(row.ProcessId)), 'process query returned an unrequested PID');
  return rows;
}
async function deadline(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Launcher deadline: ${label}`)), ms); })]); }
  finally { clearTimeout(timer); }
}
export function classifyNativeOutput(report, stdout, stderr) {
  report.processOutput = { stdout, stderr, captureWindow: 'after Playwright launch; launch failures retain Playwright call-log in launcher-operation-error', classifications: [] };
  for (const [stream, text] of Object.entries({ stdout, stderr })) {
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      let classification = null;
      if (/^(Debugger listening on ws:\/\/127\.0\.0\.1:\d+\/[\w-]+|For help, see: https:\/\/nodejs\.org\/en\/docs\/inspector|Debugger attached\.|Debugger ending on ws:\/\/127\.0\.0\.1:\d+\/[\w-]+|DevTools listening on ws:\/\/127\.0\.0\.1:\d+\/[\w/-]+)$/.test(line)) classification = 'owned-inspector-protocol';
      if (line === 'Waiting for the debugger to disconnect...' && report.cleanup?.naturalExit === true
        && Number.isInteger(report.inspector?.pid) && report.inspector.type === 'browser') classification = 'owned-inspector-graceful-disconnect';
      report.processOutput.classifications.push({ stream, line, classification: classification || 'UNCLASSIFIED' });
      if (!classification) report.diagnostics.push({ event: 'unclassified-process-output', stream, line });
    }
  }
}

async function main(argv) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log('TEST ONLY: node tools/test-wmusic-network-security.mjs --runtime-root <installed candidate> --scratch-root <designated scratch>/native-network --openssl <installed openssl.exe>'); return;
  }
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    assert.ok(['--runtime-root', '--scratch-root', '--openssl'].includes(argv[index]) && argv[index + 1] && !flags.has(argv[index]), `invalid/duplicate argument ${argv[index]}`);
    flags.set(argv[index], argv[index + 1]);
  }
  for (const name of ['--runtime-root', '--scratch-root', '--openssl']) assert.ok(flags.has(name), `${name} is mandatory; no old-runtime fallback`);
  assert.equal(process.platform, 'win32', 'native Windows evidence required; no silent skip');
  const repo = await fs.realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  const runtimeRoot = await fs.realpath(resolve(flags.get('--runtime-root'))), scratchRoot = await canonicalScratchPath(flags.get('--scratch-root'));
  const openssl = await fs.realpath(resolve(flags.get('--openssl')));
  assert.ok(!inside(repo, scratchRoot) && !inside(runtimeRoot, scratchRoot), 'all generated files must be outside repo/runtime-root');
  const report = { schemaVersion: 1, scope: 'TEST-ONLY native HTTP clients, not app/control pipeline', createdAt: new Date().toISOString(), runtimeRoot,
    launcher: { pid: process.pid, execPath: process.execPath, versions: process.versions }, operationSucceeded: false, diagnostics: [], cases: [],
    exclusions: ['No production main/preload/IPC/control pipeline imported; app SSRF/CDN allowlists, sender validation and actual account/CDN paths remain separate canonical/native gates.',
      'No real account, external network target, updater feed/download/install, registry, OS trust, system proxy or global environment changes.',
      'node-gyp Undici is independently resolved/fingerprinted, not executed as a downloader.',
      'No cache/redirect-interceptor advisory composition tested; this is not an all-advisory reachability claim.',
      'Chromium/Electron trusted-CA hostname isolation, proxy routing, SRI, audio/cover/login and abort are not exercised here; only basic HTTP and default untrusted TLS are exercised.',
      'Primary app compatibility and default native UI passes are not embedded global-fetch SRI proof.'] };
  let root, live, evidence, instance, child, baseline, identity, native, paths;
  const chunks = { stdout: [], stderr: [] }, pids = new Set(), cleanup = { verified: false, forcedKill: false, naturalExit: false, errors: [] };
  report.cleanup = cleanup;
  let unsafePaths = false;
  const verifyRoots = async (extra = []) => {
    assert.equal(unsafePaths, false, 'scratch validation previously failed; refusing further path access');
    try { await validateScratchRoots([repo, runtimeRoot], [scratchRoot, root, cleanup.liveRemoved ? null : live, evidence, ...extra]); }
    catch (error) {
      unsafePaths = true;
      if (report.unchanged) report.unchanged = { ...report.unchanged, verified: false, invalidated: true,
        inventorySnapshot: 'historical-only: captured before path validation failed' };
      throw error;
    }
  };
  const writeEvidence = async (name, value) => { await verifyRoots(); await fs.writeFile(join(evidence, name), value); };
  try {
    await fs.mkdir(scratchRoot, { recursive: true }); await verifyRoots();
    const createdRoot = await fs.mkdtemp(join(scratchRoot, 'run-')); await verifyRoots([createdRoot]); root = createdRoot;
    const createdLive = join(root, 'live'); await fs.mkdir(createdLive); await verifyRoots([createdLive]); live = createdLive;
    const createdEvidence = join(root, 'evidence'); await fs.mkdir(createdEvidence); await verifyRoots([createdEvidence]); evidence = createdEvidence;
    report.reportPath = join(evidence, 'report.json'); report.runRoot = root;
    baseline = await governedInventory(repo); await writeEvidence('governed-before.json', JSON.stringify(baseline, null, 2) + '\n');
    report.ownedFiles = await Promise.all(['tools/test-wmusic-network-security.mjs', 'test/network-security-report-gates.test.mjs'].map(name => fileEvidence(join(repo, name))));
    identity = await dependencyIdentity(runtimeRoot); report.installed = identity;
    report.opensslExecutable = await fileEvidence(openssl);
    paths = Object.fromEntries(['appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps'].map(name => [name, join(live, name)]));
    const home = join(live, 'home'), certs = join(live, 'certs');
    const generatedPaths = [...Object.values(paths), home, join(home, 'local'), certs];
    await verifyRoots();
    await Promise.all(generatedPaths.map(path => fs.mkdir(path, { recursive: true })));
    await verifyRoots(generatedPaths);
    report.freshPaths = await Promise.all(Object.entries(paths).map(async ([name, path]) => ({ name, path, contents: await fs.readdir(path) })));
    assert.ok(report.freshPaths.every(row => row.contents.length === 0));
    const env = childEnvironment(paths, home); report.childEnvironmentNames = Object.keys(env).sort();
    await createCertificates(openssl, certs, env, report);
    const config = { runtimeRoot, paths, certs, evidence, specs: requiredCases(), body: FIXTURE_BODY, auth: AUTH, cookie: COOKIE };
    const bootstrap = join(live, 'test-only-network-host.cjs'), code = `(${testOnlyHost.toString()})(${JSON.stringify(config)});\n`;
    await verifyRoots(generatedPaths); await fs.writeFile(bootstrap, code); report.bootstrap = await fileEvidence(bootstrap);
    await runFile(process.execPath, ['--check', bootstrap], { env, timeout: 15000, windowsHide: true });
    const { _electron } = createRequire(join(runtimeRoot, 'package.json'))('playwright-core');
    await verifyRoots(generatedPaths);
    instance = await _electron.launch({ executablePath: identity.electron.executable.path, args: [bootstrap], cwd: live, env, timeout: 25000 });
    child = instance.process(); pids.add(child.pid); report.launcher.electronLauncherPid = child.pid;
    for (const stream of ['stdout', 'stderr']) child[stream]?.on('data', chunk => chunks[stream].push(chunk.toString()));
    const startup = JSON.parse(await fs.readFile(join(evidence, 'startup.json'), 'utf8'));
    pids.add(startup.identity.pid); report.startup = startup;
    report.inspector = await deadline(instance.evaluate(({ app }) => ({ pid: process.pid, ppid: process.ppid, execPath: process.execPath,
      type: process.type, versions: process.versions, paths: Object.fromEntries(['appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps'].map(name => [name, app.getPath(name)])),
      processMetrics: app.getAppMetrics().map(row => ({ pid: row.pid, type: row.type })) })), 5000, 'identity read');
    for (const row of report.inspector.processMetrics) pids.add(row.pid);
    assert.equal(report.inspector.pid, startup.identity.pid); assert.equal(report.inspector.type, 'browser');
    assert.equal(await fs.realpath(report.inspector.execPath), identity.electron.executable.path);
    assert.equal(report.inspector.versions.electron, identity.electron.version);
    for (const [name, target] of Object.entries(paths)) assert.equal(resolve(report.inspector.paths[name]), resolve(target));
    report.containment = { ...startup.containment, verified: true, inspectorConfirmedBeforeFixtures: true };
    report.processesAtLaunch = await observedWindowsProcesses(pids);
    native = await deadline(instance.evaluate(() => globalThis.__wmusicNetworkProbe.run()), 100000, 'native fixture matrix');
    for (const row of native.processMetrics || []) pids.add(row.pid);
    report.native = native; report.cases = native.cases.map(row => ({ ...row, securityAccepted: assessObservation(requiredCases().find(spec => spec.id === row.id), row.observation) }));
    report.diagnostics.push(...native.diagnostics);
    if (native.deniedNetwork.length) report.diagnostics.push({ event: 'unexpected-containment-attempts', records: native.deniedNetwork });
    report.runtimeCleanup = native.runtimeCleanup; report.operationSucceeded = native.operationSucceeded;
    const after = await dependencyIdentity(runtimeRoot); report.installedAfter = after;
    report.provenance = { verified: JSON.stringify(after) === JSON.stringify(identity)
      && native.identity.pid === report.inspector.pid && native.identity.execPath === report.inspector.execPath
      && native.externalImport.path === identity.external.entry.path && native.externalImport.version === identity.external.version
      && native.dispatcherInstallation.installedIdentityVerified && native.dispatcherInstallation.globalFetchFunctionUnchanged
      && report.cases.filter(row => row.id.includes('/after-global-dispatcher/sri/')).every(row => row.observation.dispatchDelta > 0),
      embeddedUndiciSourceSha256: native.identity.builtinUndiciSourceSha256, actualElectronExeSha256: identity.electron.executable.sha256 };
  } catch (error) { report.diagnostics.push({ event: 'launcher-operation-error', name: error.name, message: error.message, stack: error.stack }); }
  finally {
    try { await verifyRoots(); }
    catch (error) {
      cleanup.errors.push({ operation: 'scratch-path-validation', message: error.message });
      // Never read, write or recursively remove a path after its safety failed.
      evidence = undefined; live = undefined;
    }
    if (evidence) {
      try {
        const startup = JSON.parse(await fs.readFile(join(evidence, 'startup.json'), 'utf8')); pids.add(startup.identity.pid);
        if (!report.startup) report.startup = startup;
      } catch {}
      if (!native) {
        try { native = JSON.parse(await fs.readFile(join(evidence, 'native-observations.json'), 'utf8')); report.partialNative = native; report.cases = native.cases; report.runtimeCleanup = native.runtimeCleanup; }
        catch {}
      }
    }
    if (instance) {
      try { await deadline(instance.evaluate(({ app }) => { setImmediate(() => app.quit()); return true; }), 5000, 'graceful app.quit'); }
      catch (error) { if ([...pids].some(alive)) cleanup.errors.push({ operation: 'quit-request', message: error.message }); }
    }
    for (let count = 0; count < 100 && [...pids].some(alive); count++) await sleep(100);
    let survivors = [...pids].filter(alive);
    if (root) {
      try { cleanup.processQueryBeforeFallback = await observedWindowsProcesses(pids); }
      catch (error) { cleanup.errors.push({ operation: 'process-query', message: error.message }); }
    }
    if (survivors.length) {
      // No race-free Windows creation handle is retained for every observed PID.
      // Even a once-valid PID can now belong to a reader or another process tree.
      // Refuse ALL PID-based forced cleanup (including /T); retain the failed gate.
      cleanup.errors.push({ operation: 'process-cleanup-refused', pids: survivors,
        message: 'Observed PID still live; creation identity is not attested. No process or descendant was signalled.' });
    }
    cleanup.pids = [...pids].map(pid => ({ pid, alive: alive(pid) }));
    if (root) {
      try { cleanup.processQueryAfter = await observedWindowsProcesses(pids); }
      catch (error) { cleanup.errors.push({ operation: 'final-process-query', message: error.message }); }
    }
    if (evidence) {
      try {
        const finalNative = JSON.parse(await fs.readFile(join(evidence, 'native-observations.json'), 'utf8'));
        report.finalNativeReadback = await fileEvidence(join(evidence, 'native-observations.json'));
        report.native = finalNative;
        report.cases = finalNative.cases.map(row => ({ ...row, securityAccepted: assessObservation(requiredCases().find(spec => spec.id === row.id), row.observation) }));
        report.runtimeCleanup = finalNative.runtimeCleanup;
        for (const diagnostic of finalNative.diagnostics) if (!report.diagnostics.some(existing => JSON.stringify(existing) === JSON.stringify(diagnostic))) report.diagnostics.push(diagnostic);
        if (finalNative.deniedNetwork?.length && !report.diagnostics.some(row => row.event === 'unexpected-containment-attempts')) report.diagnostics.push({ event: 'unexpected-containment-attempts', records: finalNative.deniedNetwork });
      } catch (error) { if (report.operationSucceeded) report.diagnostics.push({ event: 'final-native-readback-error', message: error.message }); }
      try { report.lifecycle = (await fs.readFile(join(evidence, 'lifecycle.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)); }
      catch (error) { cleanup.errors.push({ operation: 'lifecycle-read', message: error.message }); }
    }
    cleanup.nativeQuitCode = report.lifecycle?.find(row => row.event === 'quit')?.code ?? null;
    cleanup.launcherExitCode = child?.exitCode ?? null; cleanup.launcherSignal = child?.signalCode ?? null;
    cleanup.naturalExit = !cleanup.forcedKill && cleanup.nativeQuitCode === 0 && child?.exitCode === 0 && cleanup.pids.every(row => !row.alive);
    if (live) {
      try { await verifyRoots(); await fs.rm(live, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }); cleanup.liveRemoved = !(await fs.stat(live).catch(() => null)); }
      catch (error) { cleanup.errors.push({ operation: 'live-profile-cert-host-removal', message: error.message }); }
      cleanup.removedRoot = live; cleanup.profilesCertificatesTempHostRemoved = cleanup.liveRemoved === true;
    }
    cleanup.verified = cleanup.errors.length === 0 && cleanup.naturalExit && cleanup.liveRemoved === true
      && Array.isArray(cleanup.processQueryAfter) && cleanup.processQueryAfter.length === 0;
    if (baseline) {
      try {
        await verifyRoots();
        const after = await governedInventory(repo); report.unchanged = { verified: JSON.stringify(after) === JSON.stringify(baseline),
          sourceFiles: baseline.src.length, outputFiles: baseline.out.length, approvedBrandingFiles: baseline.approved6.length,
          beforeSha256: sha(JSON.stringify(baseline)), afterSha256: sha(JSON.stringify(after)) };
        if (evidence) await writeEvidence('governed-after.json', JSON.stringify(after, null, 2) + '\n');
      } catch (error) { report.diagnostics.push({ event: 'governed-readback-error', message: error.message }); }
    }
    classifyNativeOutput(report, chunks.stdout.join(''), chunks.stderr.join(''));
    report.acceptance = evaluateReport(report); report.securityAccepted = report.acceptance.securityAccepted;
    report.completedAt = new Date().toISOString();
    if (evidence) {
      try {
        await writeEvidence('stdout.log', chunks.stdout.join(''));
        await writeEvidence('stderr.log', chunks.stderr.join(''));
        await writeEvidence('report.json', JSON.stringify(report, null, 2) + '\n');
      } catch (error) {
        cleanup.errors.push({ operation: 'evidence-write-refused', message: error.message }); cleanup.verified = false;
        report.acceptance = evaluateReport(report); report.securityAccepted = report.acceptance.securityAccepted;
      }
    }
    console.log(JSON.stringify({ reportPath: report.reportPath || null, operationSucceeded: report.operationSucceeded,
      securityAccepted: report.securityAccepted, acceptance: report.acceptance, cleanup, unchanged: report.unchanged || null }, null, 2));
    process.exitCode = report.acceptance.exitCode;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
