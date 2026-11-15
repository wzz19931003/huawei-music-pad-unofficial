/** The five primary destinations from the user-supplied Pad references. */
export function activePadTab(route, playerOpen = false) {
  if (playerOpen) return 'player';
  if (route === 'home' || route === 'hall' || route === 'cafe') return route;
  return route === 'search' ? 'home' : 'mine';
}

export const PAD_TABS = Object.freeze([
  { id: 'home', label: '首页', icon: 'home' },
  { id: 'hall', label: '音乐厅', icon: 'hall' },
  { id: 'player', label: '现在就听', icon: 'music' },
  { id: 'cafe', label: 'café听', icon: 'radio' },
  { id: 'mine', label: '我的', icon: 'user' },
]);
