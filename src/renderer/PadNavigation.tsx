import { CircleUserRound, Heart, History, Home, Landmark, ListMusic, Music2, RadioTower, Settings } from './PadIcons';
import { PAD_TABS } from './pad-navigation.mjs';

export type PadTab = 'home' | 'hall' | 'player' | 'cafe' | 'mine';
export type DesktopDestination = 'favorites' | 'playlists' | 'history' | 'settings';
const icons = { home: Home, hall: Landmark, music: Music2, radio: RadioTower, user: CircleUserRound };
const library = [
  { id: 'favorites', label: '我的收藏', Icon: Heart },
  { id: 'playlists', label: '我的歌单', Icon: ListMusic },
  { id: 'history', label: '最近播放', Icon: History },
  { id: 'settings', label: '设置', Icon: Settings },
] as const;

export function PadNavigation({ active, activeRoute, onNavigate, onOpenLibrary }: {
  active: string; activeRoute?: string; onNavigate: (tab: PadTab) => void;
  onOpenLibrary?: (route: DesktopDestination) => void;
}) {
  const libraryActive = active !== 'player' && library.some(item => item.id === activeRoute);
  return <aside className="desktop-sidebar" aria-label="桌面侧栏">
    <nav className="pad-navigation" aria-label="主导航">
      {PAD_TABS.map(tab => {
        const Icon = icons[tab.icon as keyof typeof icons];
        const selected = active === tab.id && !libraryActive;
        return <button type="button" key={tab.id} className={`pad-nav-item${selected ? ' is-active' : ''}`}
          aria-current={selected ? 'page' : undefined} onClick={() => onNavigate(tab.id as PadTab)}>
          <span className="pad-nav-glyph"><Icon selected={selected} aria-hidden="true" /></span><span>{tab.label}</span>
        </button>;
      })}
    </nav>
    {onOpenLibrary ? <nav className="desktop-library-nav" aria-label="音乐库导航">
      {library.map(({ id, label, Icon }) => <button type="button" key={id}
        className={`pad-nav-item${libraryActive && activeRoute === id ? ' is-active' : ''}`}
        aria-current={libraryActive && activeRoute === id ? 'page' : undefined} onClick={() => onOpenLibrary(id)}>
        <span className="pad-nav-glyph"><Icon variant={id === 'playlists' ? 'sleeve' : 'default'} selected={libraryActive && activeRoute === id} aria-hidden="true" /></span><span>{label}</span>
      </button>)}
    </nav> : null}
  </aside>;
}
