import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReleaseNotes } from '../src/main/update-release-notes.mjs';

const textOf = (result) => result.releaseNotes.flatMap((entry) => entry.sections.flatMap((section) => section.items)).join('\n');

test('malformed delimiter storms do not monopolize the main process within the raw-input cap', () => {
  for (const input of ['['.repeat(65_536), '!['.repeat(32_768), 'ms-'.repeat(21_845),
    '[x]('.repeat(16_384), '<script'.repeat(9_362), '<h2'.repeat(21_845)]) {
    const start = performance.now();
    const result = normalizeReleaseNotes(input, '1.1.0', '1.0.0');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 250, `bounded malformed input took ${elapsed.toFixed(0)}ms`);
    assert.ok(textOf(result).length <= 6000);
  }
});

test('invalid installed-version bounds cannot be silently treated as an absent lower bound', () => {
  for (const currentVersion of [null, '', 'v1.0.0', 0, {}, '1.1.0', '2.0.0']) {
    assert.deepEqual(normalizeReleaseNotes('不得跨越错误版本边界', '1.1.0', currentVersion).releaseNotes, []);
  }
});

test('English inline change prefixes and non-URL prose survive resource stripping', () => {
  const result = normalizeReleaseNotes('Added:queue search\nImproved:list scrolling\nFixed:queue ordering\n## Notes\nNote:configuration stays unchanged\n[详情](custom-scheme://untrusted/path)\ncustom-scheme://untrusted/other', '1.1.0');
  assert.deepEqual(result.releaseNotes[0].sections, [
    { kind: 'added', items: ['queue search'] }, { kind: 'improved', items: ['list scrolling'] },
    { kind: 'fixed', items: ['queue ordering'] }, { kind: 'text', items: ['Notes', 'Note:configuration stays unchanged', '详情'] },
  ]);
  assert.doesNotMatch(textOf(result), /custom-scheme|untrusted/);
});

test('display budgets truncate moderate notes explicitly while keeping the latest version first', () => {
  const long = normalizeReleaseNotes('🎵'.repeat(400), '1.1.0');
  const item = long.releaseNotes[0].sections[0].items[0];
  assert.ok(item.length <= 280);
  assert.ok(item.endsWith('…'));
  assert.ok(item.isWellFormed());
  assert.equal(long.releaseNotesTruncated, true);
  const versions = normalizeReleaseNotes(Array.from({ length: 10 }, (_, index) => ({ version: `1.${index + 1}.0`, note: '版本说明' })), '1.10.0', '1.0.0');
  assert.deepEqual(versions.releaseNotes.map((entry) => entry.version), ['1.10.0', '1.9.0', '1.8.0', '1.7.0', '1.6.0', '1.5.0']);
  assert.equal(versions.releaseNotesTruncated, true);
  const many = (size, sections) => Array.from({ length: sections }, (_, group) => `## ${group % 2 ? '新增' : '修复'}\n${Array.from({ length: 10 }, () => `- ${'文'.repeat(size)}`).join('\n')}`).join('\n');
  const grouped = normalizeReleaseNotes(many(8, 14), '1.1.0');
  assert.equal(grouped.releaseNotes[0].sections.length, 12);
  assert.ok(grouped.releaseNotes[0].sections.every((section) => section.items.length === 8));
  assert.equal(grouped.releaseNotesTruncated, true);
  const total = normalizeReleaseNotes(many(100, 10), '1.1.0');
  const characterCount = total.releaseNotes.flatMap((entry) => entry.sections.flatMap((section) => section.items)).reduce((sum, text) => sum + text.length, 0);
  assert.ok(characterCount <= 6000);
  assert.equal(total.releaseNotesTruncated, true);
});

test('missing, malformed and excessive raw notes fail closed without running accessors', () => {
  let reads = 0;
  const accessor = { version: '1.1.0', get note() { reads += 1; throw new Error('must not run'); } };
  const invalid = [null, undefined, 42, true, {}, ['plain-array-is-not-the-contract'],
    [{ version: '1.1.0', note: 42 }], [{ version: 'v1.1.0', note: '不得修正版本标识' }],
    [{ version: '1.1.0', note: '有效文本' }, null], [accessor],
    '长'.repeat(65_537), Array.from({ length: 33 }, () => ({ version: '1.1.0', note: '超量' })),
    [{ version: '1.1.0', note: '长'.repeat(40_000) }, { version: '1.0.1', note: '长'.repeat(40_000) }],
  ];
  for (const input of invalid) {
    assert.deepEqual(normalizeReleaseNotes(input, '1.1.0', '1.0.0'), { releaseNotes: [], releaseNotesTruncated: false });
  }
  for (const version of ['v1.1.0', '', null, '1.1']) {
    assert.deepEqual(normalizeReleaseNotes('不得修正候选版本', version).releaseNotes, []);
  }
  assert.equal(reads, 0);
});

test('fullChangelog arrays keep exact versions only within the installed-to-candidate range', () => {
  const result = normalizeReleaseNotes([
    { version: '1.1.0', note: '修复：队列顺序' },
    { version: '1.0.0', note: '已安装内容' },
    { version: '1.3.0', note: '新增：快捷搜索' },
    { version: '2.0.0', note: '未来内容' },
    { version: '1.2.0', note: null },
    { version: '1.2.0', note: '优化：列表滚动' },
    { version: '1.3.0', note: '重复内容' },
    { version: '1.3.0+unoffered', note: '未提供的构建内容' },
  ], '1.3.0', '1.0.0');
  assert.deepEqual(result.releaseNotes.map((entry) => entry.version), ['1.3.0', '1.2.0', '1.1.0']);
  assert.equal(result.releaseNotes[0].sections[0].items[0], '快捷搜索');
  assert.doesNotMatch(textOf(result), /已安装|未来|重复|未提供/);
  assert.ok(Object.isFrozen(result.releaseNotes));
  for (const entry of result.releaseNotes) {
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.sections));
    assert.ok(Object.isFrozen(entry.sections[0]));
    assert.ok(Object.isFrozen(entry.sections[0].items));
  }
});

test('only explicit release headings and prefixes become added/improved/fixed groups', () => {
  const markdown = normalizeReleaseNotes('## 新增\n- **队列筛选**\n1. `快捷搜索`\n### 优化\n- 列表滚动\n修复：播放顺序\n## 兼容性\n- 保留旧设置', '1.1.0');
  assert.deepEqual(markdown.releaseNotes, [{ version: '1.1.0', sections: [
    { kind: 'added', items: ['队列筛选', '快捷搜索'] },
    { kind: 'improved', items: ['列表滚动'] },
    { kind: 'fixed', items: ['播放顺序'] },
    { kind: 'text', items: ['兼容性', '保留旧设置'] },
  ] }]);
  const html = normalizeReleaseNotes('<h2>Added</h2><ul><li>队列筛选</li></ul><h3>Improvements</h3><p>列表滚动</p><h3>Bug fixes</h3><ol><li>播放顺序</li></ol>', '1.1.0');
  assert.deepEqual(html.releaseNotes[0].sections, markdown.releaseNotes[0].sections.slice(0, 3).map((section) => ({ ...section, items: section.items.slice(0, 1) })));
  assert.deepEqual(normalizeReleaseNotes('维护版本；修复和新增内容见正文。', '1.1.0').releaseNotes[0].sections,
    [{ kind: 'text', items: ['维护版本；修复和新增内容见正文。'] }]);
});

test('release HTML and markdown become inert text without hidden content, images, URLs or local paths', () => {
  const result = normalizeReleaseNotes(`<p>保留<b>文字</b>与 &amp; 符号</p>
    <script>hidden-script()</script><style>hidden-style</style>
    <iframe src="https://tracker.invalid/frame">hidden-frame</iframe>
    <svg><a href="javascript:alert(1)">hidden-svg</a></svg>
    <img src="https://tracker.invalid/pixel" onerror="hidden-handler()">
    ![hidden-image](https://tracker.invalid/image)
    [说明](https://tracker.invalid/read?token=private)
    <a href="javascript:alert(1)">纯文字</a>
    https://tracker.invalid/raw file:///private/update.exe C:\\private\\secret.txt
    &lt;script&gt;hidden-encoded()&lt;/script&gt;
    &#60;img src=javascript:alert(1)&#62;
    正常结尾\u202e\u0000`, '1.1.0');
  const text = textOf(result);
  assert.match(text, /保留文字与 & 符号/);
  assert.match(text, /说明/);
  assert.match(text, /纯文字/);
  assert.match(text, /正常结尾/);
  assert.doesNotMatch(JSON.stringify(result), /hidden-|tracker|private|javascript:|file:|https:|[<>]|\u202e|\\u0000/);
  const unclosed = normalizeReleaseNotes('正常内容<script>hidden-unclosed', '1.1.0');
  assert.equal(textOf(unclosed), '正常内容');
});
