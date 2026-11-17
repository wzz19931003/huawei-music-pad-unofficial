import React, { type CSSProperties } from 'react';

// Local vector geometry from the round-one proposal. No screenshot pixels or app identity assets.
// R1 observations are current-software evidence, not official artwork.
const drawings = {
  homeSelectedOutline: <><path data-part="detached-roof" fill="none" d="M2.8 14.2 13.95 3.55q2.05-1.85 4.1 0L29.2 14.2"/><path data-part="outline-house-and-arch" fill="none" d="m5.45 16.05 9.1-8.65q1.45-1.4 2.9 0l9.1 8.65v10.7q0 1.25-1.25 1.25H20v-6.7a4 4 0 0 0-8 0V28H6.7q-1.25 0-1.25-1.25Z"/></>,
  homeUnselectedOutline: <><path data-part="detached-roof" fill="none" d="M2.8 14.2 13.95 3.55q2.05-1.85 4.1 0L29.2 14.2"/><path data-part="outline-house-and-arch" fill="none" d="m5.45 16.05 9.1-8.65q1.45-1.4 2.9 0l9.1 8.65v10.7q0 1.25-1.25 1.25H20v-6.7a4 4 0 0 0-8 0V28H6.7q-1.25 0-1.25-1.25Z"/></>,
  musicHall: <><path data-part="sloped-facade" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M2.7 12.9 23.1 6.35 29.3 13.15V27.2H2.7ZM6 16.2v11h2.3V15.45Zm4.05-1.3v12.3h2.3V14.15Zm4.05-1.3v13.6h2.3V12.85Z"/></>,
  organicNoteDiscDock: <><path data-part="organic-note-disc" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M22.6 2.55C28.4 2.9 30.65 12.15 29.15 22.2c-.8 6.1-4.9 7.9-13.6 7.5C6.65 29.3 1.6 25.7 2.35 19.15 3.2 11.9 15.75 2.15 22.6 2.55ZM12.45 10.65v11.0c-.95-.4-3.05-.1-3.95 1.1-1.65 2.15.3 4.05 2.9 3.0 1.85-.7 2.85-2 2.85-3.95V12.5l8.3-1.85v8.0c-1.0-.4-3.1-.1-4.1 1.15-1.65 2.2.3 4.05 2.9 3.05 1.9-.75 2.9-2.15 2.9-4.05V7.7q0-1.15-1.15-.9l-9.55 2.15q-1.1.25-1.1 1.7Z"/></>,
  broadcastCafe: <><path data-part="open-broadcast-rings" fill="none" d="M9.3 26.35a13.05 13.05 0 1 1 13.4 0M11.15 21.95a8.45 8.45 0 1 1 9.7 0M13.05 17.55a4.25 4.25 0 1 1 5.9 0"/><path data-part="broadcast-foot" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M16 17.7 10.2 29.15h11.6Z"/></>,
  userDisc: <><path data-part="user-disc" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M16 2.25a13.75 13.75 0 1 0 0 27.5 13.75 13.75 0 0 0 0-27.5Zm0 5.0a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Zm0 11.1c-4.0 0-7.65 2.1-9.05 5.1a11.5 11.5 0 0 0 18.1 0c-1.4-3-5.05-5.1-9.05-5.1Z"/></>,
  selectedStar: <><path data-part="star-fold-tail" fill="var(--pad-icon-fill, currentColor)" stroke="none" opacity=".45" d="M19.8 20.3 23.35 26.05q1.2 2.15-1.2 1.1l-5.1-2.6Z"/><path data-part="asymmetric-star" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M14.45 3.85q1.0-2.25 2.15 0l3.2 6.5 7.35 1.0q2.45.35.55 1.95L8.1 28.05q-2 1.5-1.4-.95l1.7-7.9-5.3-4.9q-1.8-1.7.65-2.1l7.35-1.15Z"/></>,
  unselectedStar: <><path data-part="star-fold-tail" fill="none" opacity=".65" d="M19.8 20.3 23.35 26.05q1.2 2.15-1.2 1.1l-5.1-2.6"/><path data-part="asymmetric-star" fill="none" d="M14.45 3.85q1.0-2.25 2.15 0l3.2 6.5 7.35 1.0q2.45.35.55 1.95L8.1 28.05q-2 1.5-1.4-.95l1.7-7.9-5.3-4.9q-1.8-1.7.65-2.1l7.35-1.15Z"/></>,
  playlistBook: <><path data-part="playlist-book" fill="none" d="M5 5.3 21.15 3.6q1.6-.15 1.6 1.45v21.9q0 1.6-1.6 1.45L5 26.7q-1.45-.15-1.45-1.6V6.9q0-1.45 1.45-1.6Z"/><path data-part="book-back-leaves" fill="none" d="M26.5 5.55v21M29.7 7.65v16.8"/><path data-part="single-note" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M12.9 12.9v7.35c-.95-.3-2.65.0-3.3.9-1.15 1.65.25 3.0 2.15 2.2 1.45-.55 2.25-1.5 2.25-3.0v-6.7c2.45-.6 3.75-1.95 3.55-4.4Z"/></>,
  playlistBookSelected: <><g opacity=".65"><path data-part="book-back-leaves" fill="none" d="M26.5 5.55v21M29.7 7.65v16.8"/></g><path data-part="playlist-book" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M5 5.3 21.15 3.6q1.6-.15 1.6 1.45v21.9q0 1.6-1.6 1.45L5 26.7q-1.45-.15-1.45-1.6V6.9q0-1.45 1.45-1.6ZM12.9 12.9v7.35c-.95-.3-2.65.0-3.3.9-1.15 1.65.25 3.0 2.15 2.2 1.45-.55 2.25-1.5 2.25-3.0v-6.7c2.45-.6 3.75-1.95 3.55-4.4Z"/></>,
  singerMic: <><g data-part="tilted-mic-head" transform="rotate(11 16 14)"><path fill="none" d="M16 2.65a7.45 7.45 0 0 1 7.45 7.45V18.2a7.45 7.45 0 0 1-14.9 0v-8.1A7.45 7.45 0 0 1 16 2.65Z"/><path data-part="grille-lines" fill="none" d="M9.1 9.0h13.8M8.55 13.65h14.9M8.8 18.2h14.4M14.05 3.2v3.25M18 3.2v3.25M14.05 21.45v3.2M18 21.45v3.2"/></g><path data-part="mic-stem-base" fill="none" d="M16 25.5v4.1M12.1 29.6h7.8"/></>,
  singerMicSelected: <><g data-part="tilted-mic-head" transform="rotate(11 16 14)"><path fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M16 2.65a7.45 7.45 0 0 1 7.45 7.45V18.2a7.45 7.45 0 0 1-14.9 0v-8.1A7.45 7.45 0 0 1 16 2.65ZM9.4 8.2h13.2v1.55H9.4ZM8.8 12.9h14.4v1.55H8.8ZM9.05 17.45h13.9V19H9.05ZM13.3 3.35h1.45v3.1H13.3ZM17.25 3.35h1.45v3.1h-1.45ZM13.3 21.3h1.45v3.1H13.3ZM17.25 21.3h1.45v3.1h-1.45Z"/></g><path data-part="mic-stem-base" fill="none" d="M16 25.5v4.1M12.1 29.6h7.8"/></>,
  trophy: <><path data-part="trophy-handles" fill="none" d="M7 6.1H3.9v5.0q0 6.1 4.4 6.7M25 6.1h3.1v5q0 6.1-4.4 6.7"/><path data-part="trophy-cup" fill="none" d="M7 4.2h18v9.3c0 5.2-3.95 8.5-9 8.5s-9-3.3-9-8.5Z"/><path data-part="trophy-star" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M16 10.55 17.2 13l2.7.4-1.95 1.9.45 2.7-2.4-1.3-2.4 1.3.45-2.7-1.95-1.9 2.7-.4Z"/><path data-part="trophy-stem" fill="none" d="M16 22v6.8M11.7 29h8.6"/></>,
  trophySelected: <><g opacity=".55"><path data-part="trophy-handles" fill="none" d="M7 6.1H3.9v5.0q0 6.1 4.4 6.7M25 6.1h3.1v5q0 6.1-4.4 6.7"/></g><path data-part="trophy-cup" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M7 4.2h18v9.3c0 5.2-3.95 8.5-9 8.5s-9-3.3-9-8.5ZM16 10.55 17.2 13l2.7.4-1.95 1.9.45 2.7-2.4-1.3-2.4 1.3.45-2.7-1.95-1.9 2.7-.4Z"/><path data-part="trophy-stem" fill="none" d="M16 22v6.8M11.7 29h8.6"/></>,
  categoryPage: <><g fill="none"><rect data-part="category-page" x="6.3" y="3.2" width="19.4" height="25.6" rx="3.25"/><path data-part="top-bookmark" d="M17.75 3.2v7.0l2.05-1.65 2.05 1.65v-7"/><path data-part="page-short-lines" d="M12 20.6h8M12 24.5h8"/></g></>,
  categoryPageSelected: <><path data-part="category-page" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M9.55 3.2h12.9q3.25 0 3.25 3.25v19.1q0 3.25-3.25 3.25H9.55q-3.25 0-3.25-3.25V6.45q0-3.25 3.25-3.25ZM17.75 3.2v7l2.05-1.65 2.05 1.65v-7ZM12 19.9h8v1.4h-8ZM12 23.8h8v1.4h-8Z"/></>,
  playOrganicBadge: <><path data-part="organic-transport-badge" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M22.6 2.2C28.3 2.4 31.4 14.1 29.85 24.45c-.65 4.45-4.25 5.8-12.05 5.45C9.4 29.55 2.4 26.7 2.2 21.0 1.95 13.3 14.55 1.9 22.6 2.2ZM13.2 10.1q-1.15-.7-1.15.7v11.0q0 1.4 1.15.7l9.1-5.45q1.15-.7 0-1.4Z"/></>,
  pauseOrganicBadge: <><path data-part="organic-transport-badge" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M22.6 2.2C28.3 2.4 31.4 14.1 29.85 24.45c-.65 4.45-4.25 5.8-12.05 5.45C9.4 29.55 2.4 26.7 2.2 21.0 1.95 13.3 14.55 1.9 22.6 2.2ZM11.7 9.4a1.35 1.35 0 0 0-1.35 1.35v11.1a1.35 1.35 0 0 0 2.7 0v-11.1a1.35 1.35 0 0 0-1.35-1.35Zm7.7 0a1.35 1.35 0 0 0-1.35 1.35v11.1a1.35 1.35 0 0 0 2.7 0v-11.1a1.35 1.35 0 0 0-1.35-1.35Z"/></>,
  playPlain: <><path data-part="rounded-play" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M10.1 6.8q-1.55-.9-1.55.95v16.5q0 1.85 1.55.95l14.25-8.25q1.55-.9 0-1.8Z"/></>,
  pausePlain: <><path data-part="pause-bars" fill="none" d="M11.1 7.3v17.4M20.9 7.3v17.4"/></>,
  next: <><path data-part="next-triangle" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M6.0 7.55q-1.4-.8-1.4.9v15.1q0 1.7 1.4.9l13.45-7.55q1.4-.8 0-1.6Z"/><path data-part="next-bar" fill="none" d="M26.9 8.5v15"/></>,
  previous: <><g transform="translate(32 0) scale(-1 1)"><path data-part="next-triangle" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M6.0 7.55q-1.4-.8-1.4.9v15.1q0 1.7 1.4.9l13.45-7.55q1.4-.8 0-1.6Z"/><path data-part="next-bar" fill="none" d="M26.9 8.5v15"/></g></>,
  circleMore: <><circle data-part="more-ring" cx="16" cy="16" r="12.2" fill="none"/><g data-part="more-two-dots" fill="var(--pad-icon-fill, currentColor)" stroke="none"><circle cx="16" cy="11.55" r="1.7"/><circle cx="16" cy="20.45" r="1.7"/></g></>,
  favoriteOutline: <><path data-part="favorite-heart" fill="none" d="M16 8.15C12.5 2.2 3 3.1 3 10.9c0 5.5 5.2 11.2 11.5 16.4q1.5 1.35 3 0C23.8 22.1 29 16.4 29 10.9c0-7.8-9.5-8.7-13-2.75Z"/></>,
  favoriteFilled: <><path data-part="favorite-heart" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M16 8.15C12.5 2.2 3 3.1 3 10.9c0 5.5 5.2 11.2 11.5 16.4q1.5 1.35 3 0C23.8 22.1 29 16.4 29 10.9c0-7.8-9.5-8.7-13-2.75Z"/></>,
  menu: <><path data-part="menu-lines" fill="none" d="M3.2 7.2h25.6M3.2 16h25.6M3.2 24.8h25.6"/></>,
  search: <><circle data-part="search-ring" cx="13.3" cy="13.3" r="9.4" fill="none"/><path data-part="search-handle" fill="none" d="m20.15 20.15 8.05 8.05"/></>,
  shuffle: <><path data-part="shuffle-crossing" fill="none" d="M3.1 7.5h2.1c6.6 0 8.8 17 16.4 17h6.9m-4.0-4 4 4-4 4M3.1 24.5h2.1c2.95 0 5.45-3.65 7.6-7.55M17.0 11.0c1.45-2.2 2.9-3.5 4.6-3.5h6.9m-4-4 4 4-4 4"/></>,
  queueNote: <><g data-part="queue-note" fill="none"><path d="M3.4 6.7h12.4M3.4 15.4h10.9M3.4 24.1h6.5"/><path d="M25.0 23.0V6.1l3.6-1.6M25 23c-1.65-1.0-6.15.3-7.1 2.5-1.0 2.15.9 3.65 3.3 2.9 2.45-.75 3.8-2.15 3.8-5.4Z"/></g></>,
} as const;
const weights: Record<keyof typeof drawings, number> = {
  "homeSelectedOutline": 2.05,
  "homeUnselectedOutline": 2.05,
  "musicHall": 2.05,
  "organicNoteDiscDock": 2.05,
  "broadcastCafe": 2.15,
  "userDisc": 2.05,
  "selectedStar": 2.05,
  "unselectedStar": 1.9,
  "playlistBook": 1.8,
  "playlistBookSelected": 1.8,
  "singerMic": 1.8,
  "singerMicSelected": 2.5,
  "trophy": 1.7,
  "trophySelected": 2.45,
  "categoryPage": 1.8,
  "categoryPageSelected": 2.05,
  "playOrganicBadge": 2.05,
  "pauseOrganicBadge": 2.05,
  "playPlain": 2.05,
  "pausePlain": 3.1,
  "next": 2.35,
  "previous": 2.35,
  "circleMore": 2.0,
  "favoriteOutline": 1.95,
  "favoriteFilled": 2.05,
  "menu": 1.85,
  "search": 1.75,
  "shuffle": 1.9,
  "queueNote": 1.85
};
const sources: Record<keyof typeof drawings, 'observed' | 'original'> = {
  "homeSelectedOutline": "observed",
  "homeUnselectedOutline": "original",
  "musicHall": "observed",
  "organicNoteDiscDock": "observed",
  "broadcastCafe": "observed",
  "userDisc": "observed",
  "selectedStar": "observed",
  "unselectedStar": "observed",
  "playlistBook": "observed",
  "playlistBookSelected": "observed",
  "singerMic": "observed",
  "singerMicSelected": "observed",
  "trophy": "observed",
  "trophySelected": "observed",
  "categoryPage": "observed",
  "categoryPageSelected": "original",
  "playOrganicBadge": "observed",
  "pauseOrganicBadge": "original",
  "playPlain": "observed",
  "pausePlain": "original",
  "next": "observed",
  "previous": "observed",
  "circleMore": "observed",
  "favoriteOutline": "observed",
  "favoriteFilled": "observed",
  "menu": "observed",
  "search": "observed",
  "shuffle": "observed",
  "queueNote": "observed"
};

type ControlKey = keyof typeof drawings;
const references: Record<ControlKey, string> = {
  "homeSelectedOutline": "supplied-official-tablet-reference",
  "homeUnselectedOutline": "original-unseen-state",
  "musicHall": "supplied-official-tablet-reference",
  "organicNoteDiscDock": "supplied-official-tablet-reference",
  "broadcastCafe": "supplied-official-tablet-reference",
  "userDisc": "supplied-official-tablet-reference",
  "selectedStar": "supplied-official-tablet-reference",
  "unselectedStar": "supplied-official-tablet-reference",
  "playlistBook": "supplied-official-tablet-reference",
  "playlistBookSelected": "supplied-official-tablet-reference",
  "singerMic": "supplied-official-tablet-reference",
  "singerMicSelected": "supplied-official-tablet-reference",
  "trophy": "supplied-official-tablet-reference",
  "trophySelected": "supplied-official-tablet-reference",
  "categoryPage": "supplied-official-tablet-reference",
  "categoryPageSelected": "original-unseen-state",
  "playOrganicBadge": "supplied-official-tablet-reference",
  "pauseOrganicBadge": "original-unseen-state",
  "playPlain": "current-software-screenshot,supplied-official-tablet-reference",
  "pausePlain": "original-unseen-state",
  "next": "supplied-official-tablet-reference",
  "previous": "current-software-screenshot",
  "circleMore": "current-software-screenshot",
  "favoriteOutline": "current-software-screenshot,supplied-official-tablet-reference",
  "favoriteFilled": "supplied-official-tablet-reference",
  "menu": "current-software-screenshot",
  "search": "supplied-official-tablet-reference",
  "shuffle": "current-software-screenshot",
  "queueNote": "supplied-official-tablet-reference"
};

/** Geometry is a screenshot-informed interpretation, not visual approval. */
export function getDesktopGlyph(name: string, variant: string, selected: boolean | undefined, fill: CSSProperties['fill']) {
  let key: ControlKey | undefined;
  const filled = fill !== undefined ? fill !== 'none' : selected === true;
  switch (name) {
    case 'Home': key = selected ? 'homeSelectedOutline' : 'homeUnselectedOutline'; break;
    case 'Landmark': key = 'musicHall'; break;
    case 'Music2': if (variant !== 'plain') key = 'organicNoteDiscDock'; break;
    case 'RadioTower': key = 'broadcastCafe'; break;
    case 'CircleUserRound': key = 'userDisc'; break;
    case 'Star': key = (selected ?? filled) ? 'selectedStar' : 'unselectedStar'; break;
    case 'ListMusic': key = variant === 'sleeve' ? selected ? 'playlistBookSelected' : 'playlistBook' : 'queueNote'; break;
    case 'Mic2': key = selected ? 'singerMicSelected' : 'singerMic'; break;
    case 'Trophy': key = selected ? 'trophySelected' : 'trophy'; break;
    case 'Shapes': key = selected ? 'categoryPageSelected' : 'categoryPage'; break;
    case 'Play': key = variant === 'badge' ? 'playOrganicBadge' : 'playPlain'; break;
    case 'Pause': key = variant === 'badge' ? 'pauseOrganicBadge' : 'pausePlain'; break;
    case 'SkipForward': key = 'next'; break;
    case 'SkipBack': key = 'previous'; break;
    case 'MoreVertical': key = 'circleMore'; break;
    case 'Heart': if (variant !== 'tile') key = filled ? 'favoriteFilled' : 'favoriteOutline'; break;
    case 'Menu': key = 'menu'; break;
    case 'Search': key = 'search'; break;
    case 'Shuffle': key = 'shuffle'; break;
  }
  return key ? { key, drawing: drawings[key], weight: weights[key], source: sources[key] === 'observed' ? 'screenshot' : 'original', reference: references[key] } : undefined;
}
