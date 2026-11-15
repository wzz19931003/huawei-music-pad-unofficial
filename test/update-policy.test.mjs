import test from 'node:test';
import assert from 'node:assert/strict';

import * as policy from '../src/main/update-policy.mjs';

const github = { provider: 'github', owner: 'wzz19931003', repo: 'huawei-music-pad-unofficial', releaseType: 'release' };

test('build-controlled sources are copied, frozen, and restricted to public GitHub or HTTPS generic feeds', () => {
  assert.equal(typeof policy.validateUpdateSource, 'function', 'source validation must exist');
  assert.equal(policy.validateUpdateSource(null), null);
  assert.equal(policy.validateUpdateSource(undefined), null);
  const normalized = policy.validateUpdateSource(github);
  assert.deepEqual(normalized, github);
  assert.notEqual(normalized, github);
  assert.ok(Object.isFrozen(normalized));
  assert.deepEqual(policy.validateUpdateSource({ provider: 'generic', url: 'https://updates.music-client.org/releases/' }), {
    provider: 'generic', url: 'https://updates.music-client.org/releases/'
  });
});

test('source validation fails closed without echoing secrets or accepting placeholder/upstream targets', () => {
  const badSources = [
    false, '', [], {}, { provider: 's3', bucket: 'releases' },
    { ...github, token: 'secret-token' }, { ...github, private: true },
    { ...github, host: 'github.company.org' }, { ...github, requestHeaders: {} },
    { ...github, releaseType: 'prerelease' }, { ...github, releaseType: undefined },
    { ...github, owner: 'Daydreamcgy' }, { ...github, owner: 'YOUR_OWNER' },
    { ...github, owner: 'your-org' }, { ...github, repo: 'YOUR_REPO' },
    { ...github, owner: ' owner' }, { ...github, repo: '../setup.exe' },
    { ...github, owner: 'a/b' }, { ...github, repo: '.' },
    Object.create(github),
    ...[
      'http://updates.music-client.org/releases/',
      'https://user:secret-token@updates.music-client.org/',
      'https://updates.music-client.org/releases/?token=secret-token',
      'https://updates.music-client.org/releases/#secret-token',
      'https://updates.music-client.org/releases/?', 'https://updates.music-client.org/releases/#',
      'https://github.com/Daydreamcgy/huawei-music-win/releases/',
      'https://localhost/releases/', 'https://localhost.localdomain/releases/',
      'https://127.0.0.1/releases/', 'https://[::1]/releases/',
      'https://192.168.1.12/releases/', 'https://169.254.169.254/releases/',
      'https://updates.internal/releases/', 'https://updates.local/releases/',
      'https://example.com/releases/', 'https://cdn.example.org/releases/',
      'https://releases.invalid/', 'https://your-domain.com/releases/',
      'https://updates.music-client.org/REPLACE_ME/',
      'https://updates.music-client.org/%7Bowner%7D/',
      ' https://updates.music-client.org/',
      'https://updates.music-client.org/../other/',
      'https://updates.music-client.org/secret%0Atoken/',
      'https://updates.music-client.org:8443/releases/',
      'file:///C:/secret-token/setup.exe'
    ].map((url) => ({ provider: 'generic', url })),
    { provider: 'generic', url: 'https://updates.music-client.org/', headers: { Authorization: 'secret-token' } }
  ];
  for (const source of badSources) {
    assert.throws(() => policy.validateUpdateSource(source), (error) => {
      assert.equal(error.code, 'UPDATE_SOURCE_INVALID');
      assert.equal(error.message, 'The update source is not configured safely.');
      assert.doesNotMatch(JSON.stringify(error), /secret-token|setup\.exe/);
      assert.doesNotMatch(error.stack, /file:\/\/|[A-Z]:[\\/]/);
      return true;
    }, JSON.stringify(source));
  }
});

test('versions use strict bounded SemVer precedence rather than lexical sorting or coercion', () => {
  assert.equal(typeof policy.parseUpdateVersion, 'function', 'strict version parsing must exist');
  for (const version of ['0.1.0', '1.2.3', '1.2.3-rc.10', '1.2.3+build.09', '1.2.3-beta.1+sha.abcdef']) {
    assert.equal(policy.parseUpdateVersion(version), version);
  }
  for (const version of [null, 2, {}, '', 'v1.2.3', ' 1.2.3', '1.2.3\n', '1.2', '01.2.3',
    '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-rc..1', '1.2.3+', '1.2.3-你好',
    '9007199254740992.1.1', '1.2.3+https://signed.url/secret', '1.2.3-' + 'x'.repeat(128)]) {
    assert.equal(policy.parseUpdateVersion(version), null, String(version));
  }
  const ascending = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta',
    '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.2.0', '1.10.0', '2.0.0'];
  for (let i = 1; i < ascending.length; i += 1) {
    assert.equal(policy.compareUpdateVersions(ascending[i], ascending[i - 1]), 1);
    assert.equal(policy.compareUpdateVersions(ascending[i - 1], ascending[i]), -1);
  }
  assert.equal(policy.compareUpdateVersions('1.2.3+one', '1.2.3+two'), 0);
  assert.equal(policy.compareUpdateVersions('1.2.3-999999999999999999999', '1.2.3-999999999999999999998'), 1);
  assert.equal(policy.compareUpdateVersions('bad', '1.2.3'), null);
});
