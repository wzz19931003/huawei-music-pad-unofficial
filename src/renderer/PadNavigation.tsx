import { CircleUserRound, Home, Landmark, Music2, RadioTower } from './PadIcons';
import { PAD_TABS } from './pad-navigation.mjs';

export type PadTab = 'home' | 'hall' | 'player' | 'cafe' | 'mine';
const icons = { home: Home, hall: Landmark, music: Music2, radio: RadioTower, user: CircleUserRound };

export function PadNavigation({ active, onNavigate }: { active: string; onNavigate: (tab: PadTab) => void }) {
  return (
    <nav className={`pad-navigation${active === 'player' ? ' is-centered' : ''}`} aria-label="主导航">
      {PAD_TABS.map(tab => {
        const Icon = icons[tab.icon as keyof typeof icons];
        return (
          <button type="button" key={tab.id} className={`pad-nav-item${active === tab.id ? ' is-active' : ''}`}
            aria-current={active === tab.id ? 'page' : undefined} onClick={() => onNavigate(tab.id as PadTab)}>
            <span className="pad-nav-glyph"><Icon strokeWidth={2.2} aria-hidden="true" /></span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
