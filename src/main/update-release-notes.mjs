/**
 * Pure, JSON-safe release-note DTOs. No I/O, renderer HTML, resource URLs or paths.
 * Input contract: installed builder-util-runtime/out/updateInfo.d.ts and
 * electron-updater/out/providers/GitHubProvider.js; do not coerce source versions.
 * Raw bodies above 65,536 UTF-16 units or 32 entries are rejected, not parsed.
 * Display is capped at 6 versions / 12 sections / 8 items / 280 units per item,
 * with 6000 text units total. A separate flag discloses display truncation.
 * @typedef {NonNullable<import('../shared/types').UpdateState['releaseNotes']>} ReleaseNoteEntries
 * @typedef {{releaseNotes: ReleaseNoteEntries, releaseNotesTruncated: boolean}} ReleaseNoteFields
 */
import { compareUpdateVersions, parseUpdateVersion } from './update-policy.mjs';

/** @type {ReleaseNoteEntries} */
export const EMPTY_RELEASE_NOTES = Object.freeze([]);
const MAX_RAW_CHARACTERS = 65_536;
const MAX_RAW_ENTRIES = 32;
const MAX_ENTRIES = 6;
const MAX_SECTIONS = 12;
const MAX_ITEMS = 8;
const MAX_ITEM_CHARACTERS = 280;
const MAX_DISPLAY_CHARACTERS = 6000;

function clippedText(text, maximum) {
  if (text.length <= maximum) return text;
  let prefix = text.slice(0, maximum - 1);
  if (/[\ud800-\udbff]$/.test(prefix)) prefix = prefix.slice(0, -1);
  return `${prefix}…`;
}

/** @returns {ReleaseNoteFields} */
function boundEntries(entries) {
  const notes = [];
  let remaining = MAX_DISPLAY_CHARACTERS;
  let truncated = entries.length > MAX_ENTRIES;
  for (const entry of entries.slice(0, MAX_ENTRIES)) {
    const sections = [];
    if (entry.sections.length > MAX_SECTIONS) truncated = true;
    for (const section of entry.sections.slice(0, MAX_SECTIONS)) {
      const items = [];
      if (section.items.length > MAX_ITEMS) truncated = true;
      for (const item of section.items.slice(0, MAX_ITEMS)) {
        if (!remaining) { truncated = true; break; }
        const text = clippedText(item, Math.min(MAX_ITEM_CHARACTERS, remaining));
        if (text !== item) truncated = true;
        remaining -= text.length;
        items.push(text);
      }
      if (items.length) sections.push(Object.freeze({ kind: section.kind, items: Object.freeze(items) }));
    }
    if (sections.length) notes.push(Object.freeze({ version: entry.version, sections: Object.freeze(sections) }));
  }
  return { releaseNotes: Object.freeze(notes), releaseNotesTruncated: truncated };
}

/** Read only own data fields: no getters, prototypes, coercion or callbacks. */
function dataFields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const fields = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    fields[key] = descriptor.value;
  }
  return fields;
}

function dataArray(value, maximum) {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    result.push(descriptor.value);
  }
  return result;
}

function rawEntries(value, version) {
  if (typeof value === 'string') return value.length <= MAX_RAW_CHARACTERS ? [{ version, note: value }] : null;
  const inputs = dataArray(value, MAX_RAW_ENTRIES);
  if (!inputs) return null;
  const entries = [];
  let characters = 0;
  for (const input of inputs) {
    const entry = dataFields(input, ['version', 'note']);
    if (!entry || !parseUpdateVersion(entry.version) || !(entry.note === null || typeof entry.note === 'string')) return null;
    characters += entry.note?.length ?? 0;
    if (characters > MAX_RAW_CHARACTERS) return null;
    entries.push(entry);
  }
  return entries;
}

function decodeEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()];
    const code = name[1].toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

/** Not an HTML renderer: discard markup/resources and keep text nodes only. */
function plainText(value) {
  return decodeEntities(decodeEntities(value))
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<(script|style|iframe|object|embed|svg|math|template|head|noscript|video|audio|picture)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<h[1-6]\b[^<>]*>/gi, '\n## ')
    .replace(/<\/?(?:h[1-6]|p|div|li|ul|ol|br|hr|blockquote|pre)\b[^<>]*>/gi, '\n')
    .replace(/<[^>]*(?:>|$)/g, '')
    .replace(/!\[[^\[\]\n]*\](?:\([^()\n]*\)|\[[^\[\]\n]*\])/g, '')
    .replace(/^\s{0,3}\[[^\[\]\n]+\]:[^\n]*$/gm, '')
    .replace(/\[([^\[\]\n]+)\](?:\([^()\n]*\)|\[[^\[\]\n]*\])/g, '$1')
    .replace(/\b[a-z]:[\\/][^\s]*/gi, '')
    .replace(/\b[a-z][a-z\d+.-]{1,31}:\/\/[^\s]+|\b(?:javascript|vbscript|data|file|blob|about|app|shell|ms-[a-z-]{1,31}):[^\s]+|(?:\/\/|www\.)[^\s]+/gi, '')
    .replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n').map((line) => line.replace(/[\t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

const GROUPS = new Map([
  ['新增', 'added'], ['added', 'added'], ['features', 'added'], ['new features', 'added'],
  ['优化', 'improved'], ['improved', 'improved'], ['improvements', 'improved'], ['optimizations', 'improved'],
  ['修复', 'fixed'], ['fixed', 'fixed'], ['fixes', 'fixed'], ['bug fixes', 'fixed'],
]);

function sectionsFromText(text) {
  const sections = [];
  let kind = 'text';
  for (const raw of text.split('\n')) {
    const heading = /^#{1,6}\s+/.test(raw);
    const line = raw.replace(/^#{1,6}\s+/, '').replace(/\s+#+$/, '')
      .replace(/^(?:[-*+]\s+|\d+[.)]\s+|>\s*)/, '').replace(/^\[[ xX]\]\s*/, '')
      .replace(/\*\*|__|~~|`/g, '').trim();
    if (!line) continue;
    const match = /^([^:：]+)(?:[:：]\s*(.*))?$/.exec(line);
    const group = match && GROUPS.get(match[1].trim().toLowerCase());
    if (group) {
      kind = group;
      if (!match[2]) continue;
    } else if (heading) kind = 'text';
    const item = group ? match[2] : line;
    if (sections.at(-1)?.kind !== kind) sections.push({ kind, items: [] });
    sections.at(-1).items.push(item);
  }
  return Object.freeze(sections.map((section) => Object.freeze({ ...section, items: Object.freeze(section.items) })));
}

/**
 * Installed electron-updater: UpdateInfo.releaseNotes is string | ReleaseNoteInfo[] | null;
 * ReleaseNoteInfo contains an exact version and string | null note. Never fetch here.
 * @param {unknown} value @param {string} version @param {string | undefined} currentVersion
 * @returns {ReleaseNoteFields}
 */
export function normalizeReleaseNotes(value, version, currentVersion = undefined) {
  const empty = { releaseNotes: EMPTY_RELEASE_NOTES, releaseNotesTruncated: false };
  if (!parseUpdateVersion(version) || (currentVersion !== undefined && !parseUpdateVersion(currentVersion))) return empty;
  let inputs;
  try { inputs = rawEntries(value, version); } catch { return empty; }
  if (!inputs) return empty;
  const entries = new Map();
  for (const entry of inputs) {
    if (!entry || !parseUpdateVersion(entry.version) || typeof entry.note !== 'string') continue;
    const relative = compareUpdateVersions(entry.version, version);
    if (relative === 1 || (relative === 0 && entry.version !== version) ||
        (currentVersion && compareUpdateVersions(entry.version, currentVersion) !== 1) || entries.has(entry.version)) continue;
    const sections = sectionsFromText(plainText(entry.note));
    if (sections.length) entries.set(entry.version, Object.freeze({ version: entry.version, sections }));
  }
  return boundEntries([...entries.values()].sort((left, right) => compareUpdateVersions(right.version, left.version)));
}

/**
 * Revalidate/copy the bounded DTO at the main-to-renderer boundary. Raw strings,
 * old incompatible fields and non-text values are absent, never interpreted as HTML.
 * @param {unknown} value @param {unknown} version @param {unknown} currentVersion
 * @param {unknown} truncated
 * @returns {ReleaseNoteFields}
 */
export function projectReleaseNotes(value, version, currentVersion, truncated = false) {
  const empty = { releaseNotes: EMPTY_RELEASE_NOTES, releaseNotesTruncated: false };
  if (!parseUpdateVersion(version) || !parseUpdateVersion(currentVersion) ||
      compareUpdateVersions(version, currentVersion) !== 1) return empty;
  try {
    const inputs = dataArray(value, MAX_ENTRIES);
    if (!inputs?.length) return empty;
    const entries = [];
    const versions = new Set();
    let characters = 0;
    for (const input of inputs) {
      const entry = dataFields(input, ['version', 'sections']);
      if (!entry || !parseUpdateVersion(entry.version) || versions.has(entry.version)) return empty;
      const relative = compareUpdateVersions(entry.version, version);
      if (relative === 1 || (relative === 0 && entry.version !== version) ||
          compareUpdateVersions(entry.version, currentVersion) !== 1) return empty;
      const rawSections = dataArray(entry.sections, MAX_SECTIONS);
      if (!rawSections?.length) return empty;
      const sections = [];
      for (const inputSection of rawSections) {
        const section = dataFields(inputSection, ['kind', 'items']);
        if (!section || !['text', 'added', 'improved', 'fixed'].includes(section.kind)) return empty;
        const items = dataArray(section.items, MAX_ITEMS);
        if (!items?.length) return empty;
        for (const item of items) {
          if (typeof item !== 'string' || !item || item.length > MAX_ITEM_CHARACTERS || plainText(item) !== item) return empty;
          characters += item.length;
          if (characters > MAX_DISPLAY_CHARACTERS) return empty;
        }
        sections.push(Object.freeze({ kind: section.kind, items: Object.freeze(items) }));
      }
      versions.add(entry.version);
      entries.push(Object.freeze({ version: entry.version, sections: Object.freeze(sections) }));
    }
    return {
      releaseNotes: Object.freeze(entries.sort((left, right) => compareUpdateVersions(right.version, left.version))),
      releaseNotesTruncated: truncated === true,
    };
  } catch { return empty; }
}

