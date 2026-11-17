import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import * as importedUndici from 'undici';

// Intentionally exercise the external package, NOT Node/Electron's builtin fetch.
// All bytes, headers, and endpoints below are synthetic and owned by this file.
const require = createRequire(import.meta.url);
const BODY = 'synthetic response: bytes different from the pinned fixture\n';
const PINNED_BODY = 'synthetic pinned fixture: the expected original bytes\n';
const digest = (algorithm, body) => `${algorithm}-${createHash(algorithm).update(body).digest('base64')}`;
const TEST_OPTIONS = { timeout: 10_000, concurrency: false };

async function bounded(promise, label, milliseconds = 3_000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Local fixture deadline: ${label}`)), milliseconds);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

async function withOrigins(t, handlers, run) {
  const origins = [];
  const servers = [];
  const sockets = new Set();
  const requests = handlers.map(() => []);
  const handlerErrors = [];
  const controller = new AbortController();
  const agent = new importedUndici.Agent({
    connections: 1,
    pipelining: 1,
    connect: { timeout: 1_000 },
    headersTimeout: 2_000,
    bodyTimeout: 2_000,
    factory(origin, options) {
      assert.ok(origins.includes(String(origin)), 'Dispatcher may only connect to this test\'s owned origins');
      return new importedUndici.Pool(origin, options);
    },
  });
  const deadline = setTimeout(() => controller.abort(new Error('Local fixture request deadline')), 6_000);
  let cleanupPromise;
  function cleanup() {
    return cleanupPromise ??= (async () => {
      clearTimeout(deadline);
      controller.abort();
      const closedServers = servers.map(server => new Promise((resolve, reject) => {
        server.close(error => error && error.code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
        server.closeAllConnections();
      }));
      const closedSockets = [...sockets].map(socket => new Promise(resolve => {
        socket.once('close', resolve);
        socket.destroy();
      }));
      await bounded(Promise.all([agent.destroy(), ...closedServers, ...closedSockets]), 'cleanup');
      assert.equal(agent.destroyed, true);
      assert.equal(sockets.size, 0, 'Every owned server socket must close, including on assertion failure');
      assert.ok(servers.every(server => !server.listening));
      t.diagnostic(`cleanup: ${servers.length} owned server(s), sockets=0, agent destroyed`);
    })();
  }
  t.after(cleanup);
  try {
    for (const [index, handler] of handlers.entries()) {
      const server = createServer((request, response) => {
        requests[index].push({ method: request.method, url: request.url, headers: { ...request.headers } });
        try {
          handler(request, response);
        } catch (error) {
          handlerErrors.push(error);
          response.writeHead(500).end('synthetic fixture handler failure');
        }
      });
      servers.push(server);
      server.on('connection', socket => {
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
      });
      await bounded(new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      }), 'listen');
      origins.push(`http://127.0.0.1:${server.address().port}`);
    }
    const fetchLocal = (url, options = {}) => {
      assert.ok(origins.includes(new URL(url).origin), 'Only owned local fixture URLs may be requested');
      return importedUndici.fetch(url, {
        ...options,
        dispatcher: agent,
        signal: AbortSignal.any([controller.signal, t.signal, ...(options.signal ? [options.signal] : [])]),
      });
    };
    await run({ origins, requests, fetchLocal });
    assert.deepEqual(handlerErrors, [], 'HTTP handlers must not hide test fixture errors');
  } finally {
    await cleanup();
  }
}

function isIntegrityMismatch(error) {
  assert.ok(error instanceof TypeError, 'Fetch must reject with its integrity error, not a harness error');
  assert.match(String(error.cause), /integrity mismatch/);
  return true;
}

test('external undici rejects incorrect bytes with a tab-surrounded valid SRI digest', TEST_OPTIONS, async t => {
  t.diagnostic(`externalUndici=${require('undici/package.json').version}; entry=${require.resolve('undici')}; nodeCLI=${process.version}; builtin fetch NOT exercised`);
  assert.notEqual(importedUndici.fetch, globalThis.fetch);
  const pinnedDigest = digest('sha256', PINNED_BODY);
  assert.notEqual(pinnedDigest, digest('sha256', BODY));
  await withOrigins(t, [(_request, response) => response.end(BODY)], async ({ origins: [origin], requests, fetchLocal }) => {
    let failure;
    let acceptedBody;
    try {
      const response = await fetchLocal(`${origin}/integrity`, { integrity: `\t${pinnedDigest}\t` });
      assert.equal(response.status, 200);
      acceptedBody = await response.text();
    } catch (error) {
      failure = error;
    }
    assert.equal(requests[0].length, 1, 'The real local HTTP response must have been requested');
    if (!failure) {
      assert.equal(acceptedBody, BODY, 'Record the actual incorrect bytes, not an import/fixture failure');
      t.diagnostic(`INCORRECT_BODY_ACCEPTED=${JSON.stringify(acceptedBody)}`);
      assert.fail('SRI accepted the actual incorrect response body despite a valid tab-surrounded pin');
    }
    assert.ok(isIntegrityMismatch(failure));
  });
});

// Adjacent controls preserve existing behavior; they are not new RED reproductions.
test('external undici accepts correct SRI pins for SHA-256, SHA-384, and SHA-512', TEST_OPTIONS, async t => {
  await withOrigins(t, [(_request, response) => response.end(BODY)], async ({ origins: [origin], requests, fetchLocal }) => {
    for (const algorithm of ['sha256', 'sha384', 'sha512']) {
      const response = await fetchLocal(`${origin}/correct-pin`, { integrity: digest(algorithm, BODY) });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), BODY, algorithm);
    }
    assert.equal(requests[0].length, 3);
  });
});

test('external undici rejects wrong SRI pins without surrounding whitespace for SHA-256, SHA-384, and SHA-512', TEST_OPTIONS, async t => {
  await withOrigins(t, [(_request, response) => response.end(BODY)], async ({ origins: [origin], requests, fetchLocal }) => {
    for (const algorithm of ['sha256', 'sha384', 'sha512']) {
      await assert.rejects(async () => {
        const response = await fetchLocal(`${origin}/wrong-pin`, { integrity: digest(algorithm, PINNED_BODY) });
        assert.equal(await response.text(), BODY);
      }, isIntegrityMismatch, algorithm);
    }
    assert.equal(requests[0].length, 3);
  });
});

// GHSA-r4pc-4jcp-7pqc: ASCII whitespace is SP, HT, LF, FF, CR (not generic /\s/).
// Digest values come from node:crypto; no Undici parser/implementation is copied.
test('external undici verifies correct and wrong SRI across the ASCII whitespace matrix', TEST_OPTIONS, async t => {
  const whitespace = [
    ['SP', ' '], ['HT', '\t'], ['LF', '\n'], ['FF', '\f'], ['CR', '\r'],
    ['mixed ASCII', '\t\n\f\r '],
  ];
  await withOrigins(t, [(_request, response) => response.end(BODY)], async ({ origins: [origin], requests, fetchLocal }) => {
    for (const algorithm of ['sha256', 'sha384', 'sha512']) {
      for (const [label, padding] of whitespace) {
        await t.test(`${algorithm} ${label}: correct digest accepts exact bytes`, async () => {
          const response = await fetchLocal(`${origin}/whitespace-correct`, {
            integrity: `${padding}${digest(algorithm, BODY)}${padding}`,
          }).catch(error => {
            t.diagnostic(`${algorithm} ${label}: correct-digest fetch rejection cause=${String(error.cause)}`);
            throw error;
          });
          assert.equal(response.status, 200);
          assert.equal(await response.text(), BODY);
        });
        await t.test(`${algorithm} ${label}: wrong digest rejects incorrect bytes`, async () => {
          await assert.rejects(async () => {
            const response = await fetchLocal(`${origin}/whitespace-wrong`, {
              integrity: `${padding}${digest(algorithm, PINNED_BODY)}${padding}`,
            });
            assert.equal(await response.text(), BODY);
          }, isIntegrityMismatch);
        });
      }
    }
    assert.equal(requests[0].length, 36);
  });
});

const SYNTHETIC_HEADERS = Object.freeze({
  authorization: 'Synthetic not-a-real-token',
  cookie: 'synthetic_fixture=not_a_real_session',
  'proxy-authorization': 'Synthetic not-a-real-proxy-credential',
  'x-synthetic-control': 'owned-loopback-fixture-only',
});

test('external undici preserves explicitly synthetic credentials on a same-origin redirect', TEST_OPTIONS, async t => {
  await withOrigins(t, [
    (request, response) => request.url === '/start'
      ? response.writeHead(302, { location: '/final' }).end('synthetic redirect')
      : response.end(BODY),
    (_request, response) => response.end('unused owned second origin'),
  ], async ({ origins: [origin], requests, fetchLocal }) => {
    const response = await fetchLocal(`${origin}/start`, { redirect: 'follow', headers: SYNTHETIC_HEADERS });
    assert.equal(response.status, 200);
    assert.equal(response.redirected, true);
    assert.equal(response.url, `${origin}/final`);
    assert.equal(await response.text(), BODY);
    assert.deepEqual(requests[0].map(request => request.url), ['/start', '/final']);
    assert.equal(requests[1].length, 0);
    for (const request of requests[0]) {
      for (const [name, value] of Object.entries(SYNTHETIC_HEADERS)) assert.equal(request.headers[name], value, name);
    }
  });
});

test('external undici strips synthetic credentials across two owned HTTP origins', TEST_OPTIONS, async t => {
  let destination;
  await withOrigins(t, [
    (request, response) => request.url === '/cross'
      ? response.writeHead(307, { location: `${destination}/landing` }).end('synthetic cross-origin redirect')
      : response.end(BODY),
    (_request, response) => response.end(BODY),
  ], async ({ origins: [source, target], requests, fetchLocal }) => {
    destination = target;
    assert.notEqual(source, target, 'Different owned ports must be distinct origins');
    // Positive controls show both real HTTP handlers can observe the synthetic headers.
    for (const origin of [source, target]) {
      const response = await fetchLocal(`${origin}/positive-control`, { headers: SYNTHETIC_HEADERS });
      assert.equal(await response.text(), BODY);
    }
    const response = await fetchLocal(`${source}/cross`, { redirect: 'follow', headers: SYNTHETIC_HEADERS });
    assert.equal(response.status, 200);
    assert.equal(response.redirected, true);
    assert.equal(response.url, `${target}/landing`);
    assert.equal(await response.text(), BODY);
    assert.deepEqual(requests[0].map(request => request.url), ['/positive-control', '/cross']);
    assert.deepEqual(requests[1].map(request => request.url), ['/positive-control', '/landing']);
    for (const request of [requests[0][0], requests[0][1], requests[1][0]]) {
      for (const [name, value] of Object.entries(SYNTHETIC_HEADERS)) assert.equal(request.headers[name], value, name);
    }
    const redirectedHeaders = requests[1][1].headers;
    for (const name of ['authorization', 'cookie', 'proxy-authorization']) {
      assert.equal(Object.hasOwn(redirectedHeaders, name), false, `${name} must not reach the other origin`);
    }
    assert.equal(redirectedHeaders['x-synthetic-control'], SYNTHETIC_HEADERS['x-synthetic-control']);
  });
});

test('external undici redirect:error rejects without contacting the other owned origin', TEST_OPTIONS, async t => {
  let destination;
  await withOrigins(t, [
    (_request, response) => response.writeHead(302, { location: `${destination}/must-not-be-visited` }).end('synthetic redirect'),
    (_request, response) => response.end('synthetic forbidden redirect destination'),
  ], async ({ origins: [source, target], requests, fetchLocal }) => {
    destination = target;
    await assert.rejects(fetchLocal(`${source}/error-mode`, { redirect: 'error', headers: SYNTHETIC_HEADERS }), error => {
      assert.ok(error instanceof TypeError);
      assert.match(String(error.cause), /unexpected redirect/);
      return true;
    });
    assert.deepEqual(requests[0].map(request => request.url), ['/error-mode']);
    assert.equal(requests[1].length, 0);
    assert.equal(requests[0][0].headers.authorization, SYNTHETIC_HEADERS.authorization);
    assert.equal(requests[0][0].headers.cookie, SYNTHETIC_HEADERS.cookie);
  });
});

test('external undici redirect:manual exposes the local redirect without following it', TEST_OPTIONS, async t => {
  let destination;
  await withOrigins(t, [
    (_request, response) => response.writeHead(302, { location: `${destination}/must-not-be-visited` }).end('synthetic manual redirect body'),
    (_request, response) => response.end('synthetic forbidden redirect destination'),
  ], async ({ origins: [source, target], requests, fetchLocal }) => {
    destination = target;
    const response = await fetchLocal(`${source}/manual-mode`, { redirect: 'manual', headers: SYNTHETIC_HEADERS });
    assert.equal(response.status, 302);
    assert.equal(response.redirected, false);
    assert.equal(response.url, `${source}/manual-mode`);
    assert.equal(response.headers.get('location'), `${target}/must-not-be-visited`);
    assert.equal(await response.text(), 'synthetic manual redirect body');
    assert.deepEqual(requests[0].map(request => request.url), ['/manual-mode']);
    assert.equal(requests[1].length, 0);
    assert.equal(requests[0][0].headers.authorization, SYNTHETIC_HEADERS.authorization);
    assert.equal(requests[0][0].headers.cookie, SYNTHETIC_HEADERS.cookie);
  });
});

test('external undici abort before response headers closes the request and frees the agent', TEST_OPTIONS, async t => {
  let arrived;
  let closed;
  let stalledSocket;
  let stalledResponse;
  const requestArrived = new Promise(resolve => { arrived = resolve; });
  const socketClosed = new Promise(resolve => { closed = resolve; });
  await withOrigins(t, [(request, response) => {
    if (request.url !== '/stall-before-headers') return response.end(BODY);
    stalledSocket = request.socket;
    stalledResponse = response;
    request.socket.once('close', closed);
    arrived(); // Deliberately send no headers; cancellation, not a delay, drives the test.
  }], async ({ origins: [origin], requests, fetchLocal }) => {
    const cancellation = new AbortController();
    // Observe rejection immediately so a fixture failure cannot leak an unhandled promise.
    const pending = fetchLocal(`${origin}/stall-before-headers`, { signal: cancellation.signal })
      .then(response => ({ response }), error => ({ error }));
    await bounded(requestArrived, 'request reached server before abort');
    cancellation.abort(new DOMException('Synthetic test abort', 'AbortError'));
    const outcome = await bounded(pending, 'abort rejects fetch');
    assert.ok(outcome.error, 'An aborted fetch must not return a response');
    assert.equal(outcome.error.name, 'AbortError');
    assert.equal(outcome.error.message, 'Synthetic test abort');
    await bounded(socketClosed, 'abort closes the actual server-side request socket');
    assert.equal(stalledSocket.destroyed, true);
    assert.equal(stalledResponse.writableEnded, false, 'The server must not have completed the stalled response');
    // Prove the one-connection dispatcher is usable BEFORE unconditional fixture cleanup.
    const response = await fetchLocal(`${origin}/after-abort`);
    assert.equal(await response.text(), BODY);
    assert.deepEqual(requests[0].map(request => request.url), ['/stall-before-headers', '/after-abort']);
  });
});

test('external undici cancelling a partial body closes its socket and frees the agent', TEST_OPTIONS, async t => {
  const prefix = 'synthetic partial body prefix\n';
  let closed;
  let streamingSocket;
  let streamingResponse;
  const socketClosed = new Promise(resolve => { closed = resolve; });
  await withOrigins(t, [(request, response) => {
    if (request.url !== '/partial-body') return response.end(BODY);
    streamingSocket = request.socket;
    streamingResponse = response;
    request.socket.once('close', closed);
    response.writeHead(200, { 'content-type': 'application/octet-stream' });
    response.write(prefix); // Deliberately no end(), timers, background writes, or unbounded bytes.
  }], async ({ origins: [origin], requests, fetchLocal }) => {
    const response = await fetchLocal(`${origin}/partial-body`);
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader();
    try {
      const first = await bounded(reader.read(), 'read the actual first HTTP body chunk');
      assert.equal(first.done, false);
      assert.equal(Buffer.from(first.value).toString('utf8'), prefix);
      await bounded(reader.cancel('Synthetic body cancellation'), 'body cancellation settles');
      await bounded(reader.closed, 'cancelled reader closes');
      assert.equal((await bounded(reader.read(), 'cancelled reader is exhausted')).done, true);
      await bounded(socketClosed, 'body cancellation closes the actual server-side socket');
      assert.equal(streamingSocket.destroyed, true);
      assert.equal(streamingResponse.writableEnded, false, 'The server must not have completed the body');
    } finally {
      // This also runs when an assertion or read fails; fixture cleanup is a second safety net.
      try { await bounded(reader.cancel(), 'failure-path reader cancellation'); } finally { reader.releaseLock(); }
    }
    const nextResponse = await fetchLocal(`${origin}/after-cancel`);
    assert.equal(await nextResponse.text(), BODY);
    assert.deepEqual(requests[0].map(request => request.url), ['/partial-body', '/after-cancel']);
  });
});
