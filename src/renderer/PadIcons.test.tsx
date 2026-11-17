import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// A dynamic import lets the first RED be an explicit missing-feature assertion,
// rather than a Vite resolution error before Vitest can execute the test.
const iconPath = './PadIcons.tsx';
async function icons() {
  return import(/* @vite-ignore */ iconPath).catch(() => ({})) as Promise<Record<string, any>>;
}

describe('compatible screenshot-informed application icons', () => {
  it('renders the brief-directed Home outline without claiming the unseen state is observed', async () => {
    const library = await icons();
    expect(library.Home, 'the custom Home SVG component must exist').toBeDefined();
    const svg = renderToStaticMarkup(<library.Home />);
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('data-pad-icon="Home"');
    expect(svg).toContain('data-icon-source="original"');
    expect(svg).toContain('data-part="outline-house-and-arch"');
    expect(svg).toContain('data-part="detached-roof"');
    expect(svg).not.toMatch(/<image|<use|lucide/);
  });

  it.each([
    ['Landmark', 'sloped-facade', 'M2.7 12.9 23.1 6.35 29.3 13.15V27.2H2.7Z'],
    ['Music2', 'organic-note-disc', 'M22.6 2.55C28.4 2.9 30.65 12.15 29.15 22.2'],
    ['RadioTower', 'open-broadcast-rings', 'M9.3 26.35a13.05 13.05 0 1 1 13.4 0'],
    ['CircleUserRound', 'user-disc', 'M16 2.25a13.75 13.75 0 1 0 0 27.5'],
  ])('redraws the navigation %s rather than a generic outline', async (name, part, path) => {
    const library = await icons();
    expect(library[name], `${name} must be exported`).toBeDefined();
    const svg = renderToStaticMarkup(React.createElement(library[name]));
    expect(svg).toContain(`data-part="${part}"`);
    expect(svg).toContain(path);
    expect(svg).toContain('data-icon-source="screenshot"');
    expect(svg).not.toMatch(/<image|<use|<mask|<clipPath|lucide/);
  });

  it.each([
    ['Play', 'rounded-play', 'M10.1 6.8q-1.55-.9-1.55.95v16.5'],
    ['Pause', 'pause-bars', 'M11.1 7.3v17.4M20.9 7.3v17.4'],
    ['SkipForward', 'next-triangle', 'M6.0 7.55q-1.4-.8-1.4.9v15.1'],
    ['ListMusic', 'queue-note', 'M3.4 6.7h12.4M3.4 15.4h10.9M3.4 24.1h6.5'],
    ['Heart', 'favorite-heart', 'M16 8.15C12.5 2.2 3 3.1 3 10.9'],
    ['HeartOff', 'dislike-slash', 'M2.35 2.35 21.65 21.65'],
    ['MoreVertical', 'more-ring', 'r="12.2"'],
    ['Repeat', 'circular-mode', 'M10.2 2.1a10 10 0 1 0 11.7 10.1'],
    ['Menu', 'menu-lines', 'M3.2 7.2h25.6M3.2 16h25.6M3.2 24.8h25.6'],
    ['Settings', 'soft-six-tooth-cog', 'M10.25 1.9h3.5'],
    ['Search', 'search-ring', 'r="9.4"'],
  ])('locks the observed %s control silhouette', async (name, part, signature) => {
    const library = await icons();
    expect(library[name], `${name} must be exported`).toBeDefined();
    const svg = renderToStaticMarkup(React.createElement(library[name]));
    expect(svg).toContain(`data-part="${part}"`);
    expect(svg).toContain(signature);
    expect(svg).toContain(`data-icon-source="${name === 'Pause' ? 'original' : 'screenshot'}"`);
    if (name === 'MoreVertical') expect(svg.match(/<circle/g)).toHaveLength(3); // ring + TWO dots
  });

  it('exports every inventoried renderer name plus the forthcoming controls as real inline vectors', async () => {
    const library = await icons();
    // Inventory made from ALL nine renderer import sites before integration.
    // Keep this fixed even after the parent replaces those import specifiers.
    const names = `ArrowUpRight AudioLines BookOpen CassetteTape CheckCircle ChevronDown ChevronLeft ChevronRight CircleUserRound Copy Disc3 Download Folder Guitar Headphones Heart HeartOff HeartPulse HelpCircle History Home Info Landmark ListChecks ListMusic ListPlus ListStart Loader2 LockKeyhole LogIn LogOut Mail Maximize2 Menu Mic2 Minus MoreVertical Music2 Pause Piano Play RadioTower RefreshCw Repeat Repeat1 Search Settings Shapes ShieldCheck Shuffle SkipBack SkipForward Sparkles Square Star Ticket Trash2 Trophy UserRound UsersRound Volume1 Volume2 VolumeX Waves X`.split(' ');
    expect(names).toHaveLength(65);
    const exported = Object.keys(library).filter(name => /^[A-Z]/.test(name)).sort();
    expect(exported).toEqual([...names].sort());
    for (const name of names) {
      const svg = renderToStaticMarkup(React.createElement(library[name]));
      expect(svg, name).toMatch(/^<svg\b/);
      expect(svg, name).toContain(`data-pad-icon="${name}"`);
      expect(svg, name).toMatch(/data-icon-source="(?:screenshot|original)"/);
      expect(svg, name).toMatch(/<(?:path|circle|rect|ellipse)\b/);
      expect(svg, name).not.toMatch(/<image|<use|<foreignObject|<text|href=|data:image|lucide/);
    }
  });

  it('labels unseen controls as originals instead of claiming screenshot evidence', async () => {
    const library = await icons();
    for (const name of ['HeartPulse', 'CheckCircle', 'Download', 'VolumeX', 'Pause', 'Repeat1', 'Trash2', 'ShieldCheck']) {
      expect(library[name], name).toBeDefined();
      expect(renderToStaticMarkup(React.createElement(library[name])), name).toContain('data-icon-source="original"');
    }
    for (const name of ['SkipBack', 'Shuffle', 'Menu', 'MoreVertical']) {
      expect(renderToStaticMarkup(React.createElement(library[name])), name).toContain('data-icon-reference-kind="current-software-screenshot"');
    }
    for (const name of ['Mail', 'Piano', 'Guitar', 'CassetteTape', 'Disc3', 'Folder', 'History', 'Mic2', 'Star', 'Ticket', 'HelpCircle', 'Trophy', 'Shapes', 'Sparkles', 'Waves', 'UsersRound', 'ListChecks']) {
      expect(library[name], name).toBeDefined();
      expect(renderToStaticMarkup(React.createElement(library[name])), name).toContain('data-icon-source="screenshot"');
    }
  });

  it.each([32, '1.5em'])('accepts the compatible size prop %s', async size => {
    const library = await icons();
    const svg = renderToStaticMarkup(<library.Search size={size} />);
    expect(svg).toContain(`width="${size}"`);
    expect(svg).toContain(`height="${size}"`);
    expect(svg).not.toContain(' size=');
  });

  it('forwards SVG, CSS, class, dimension, and data props without replacing caller values', async () => {
    const library = await icons();
    const svg = renderToStaticMarkup(<library.Search size={32} width={46} height="2em" strokeWidth="1.25"
      className="search-symbol" style={{ opacity: .65, transform: 'rotate(3deg)' }} id="find-song"
      stroke="tomato" strokeLinecap="square" strokeLinejoin="bevel" vectorEffect="non-scaling-stroke"
      data-testid="lookup" tabIndex={-1} />);
    for (const attribute of ['width="46"', 'height="2em"', 'stroke-width="1.25"', 'class="pad-icon search-symbol"',
      'style="opacity:0.65;transform:rotate(3deg)"', 'id="find-song"', 'stroke="tomato"',
      'stroke-linecap="square"', 'stroke-linejoin="bevel"', 'vector-effect="non-scaling-stroke"', 'data-testid="lookup"', 'tabindex="-1"']) {
      expect(svg).toContain(attribute);
    }
    // Heavy round-ended transport bars must also respond, not hide a fixed
    // child stroke-width that silently defeats this public prop.
    const pause = renderToStaticMarkup(<library.Pause strokeWidth={4} />);
    expect(pause.match(/stroke-width=/g)).toHaveLength(1);
    expect(pause).toContain('stroke-width="4"');
  });

  it('is decorative by default but exposes explicitly named glyphs accessibly', async () => {
    const library = await icons();
    expect(renderToStaticMarkup(<library.Search />)).toContain('aria-hidden="true"');
    const named = renderToStaticMarkup(<library.Search aria-label="搜索歌曲" />);
    expect(named).toContain('aria-hidden="false"');
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="搜索歌曲"');
    const labelled = renderToStaticMarkup(<library.Search aria-labelledby="lookup-title"><title id="lookup-title">查找</title></library.Search>);
    expect(labelled).toContain('aria-hidden="false"');
    expect(labelled).toContain('<title id="lookup-title">查找</title>');
    const hidden = renderToStaticMarkup(<library.Search aria-label="搜索" aria-hidden="true" />);
    expect(hidden).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<library.Search aria-hidden={false} />)).toContain('aria-hidden="false"');
  });

  it('forwards the SVG ref and the original event handler', async () => {
    const library = await icons();
    const ref = React.createRef<SVGSVGElement>();
    const onClick = () => undefined;
    expect(library.Heart.render, 'the compatible component must forward its SVG ref').toBeTypeOf('function');
    const root = library.Heart.render({ onClick, 'aria-pressed': true }, ref);
    expect(root.type).toBe('svg');
    expect(root.props.ref).toBe(ref);
    expect(root.props.onClick).toBe(onClick);
    expect(root.props['aria-pressed']).toBe(true);
  });

  it('supports outlined and filled hearts and explicit fill on intrinsic solid glyphs', async () => {
    const library = await icons();
    const outline = renderToStaticMarkup(<library.Heart fill="none" />);
    const saved = renderToStaticMarkup(<library.Heart fill="currentColor" />);
    expect(outline).toContain('fill="none"');
    expect(saved).toContain('fill="currentColor"');
    const path = /\sd="([^"]+)"/;
    expect(outline.match(path)?.[1]).toBeTruthy();
    expect(outline.match(path)?.[1]).toBe(saved.match(path)?.[1]);
    expect(saved).toMatch(/data-part="favorite-heart"[^>]*stroke="none"/);
    const solid = renderToStaticMarkup(<library.Landmark fill="#e60045" />);
    expect(solid).toContain('fill="#e60045"');
    expect(solid).toContain('--pad-icon-fill:#e60045');
    expect(solid).toContain('fill="var(--pad-icon-fill, currentColor)"');
    expect(renderToStaticMarkup(<library.Music2 style={{ fill: 'rebeccapurple' }} />)).toContain('--pad-icon-fill:rebeccapurple');
  });

  it('provides the positive note separately from the default knocked-out navigation disc', async () => {
    const library = await icons();
    const navigation = renderToStaticMarkup(<library.Music2 />);
    const note = renderToStaticMarkup(<library.Music2 variant="plain" />);
    expect(navigation).toContain('data-part="organic-note-disc"');
    expect(note).toContain('data-part="paired-note"');
    expect(note).not.toContain('organic-note-disc');
    expect(note).toContain('data-icon-variant="plain"');
    expect(note).not.toContain(' variant=');
  });

  it.each(['Play', 'Pause'])('offers %s with a transparent-cutout organic badge, without screenshot assets', async name => {
    const library = await icons();
    const plain = renderToStaticMarkup(React.createElement(library[name]));
    const badge = renderToStaticMarkup(React.createElement(library[name], { variant: 'badge' }));
    expect(badge).toContain('data-part="organic-transport-badge"');
    expect(badge).toContain('fill-rule="evenodd"');
    expect(badge).toContain('data-icon-variant="badge"');
    expect(plain).not.toContain('organic-transport-badge');
    expect(badge).not.toMatch(/<image|<mask|<clipPath|<use|fill="(?:black|white|#)/);
  });

  it('keeps the reference favorites tile and playlist sleeve distinct from row/queue controls', async () => {
    const library = await icons();
    const favorite = renderToStaticMarkup(<library.Heart variant="tile" />);
    expect(favorite).toContain('data-part="favorite-tile"');
    expect(favorite).toContain('fill-rule="evenodd"');
    expect(favorite).toContain('data-part="tile-top-rail"');
    expect(renderToStaticMarkup(<library.Heart />)).not.toContain('favorite-tile');
    const sleeve = renderToStaticMarkup(<library.ListMusic variant="sleeve" />);
    expect(sleeve).toContain('data-part="playlist-book"');
    expect(sleeve).not.toContain('queue-note');
    expect(renderToStaticMarkup(<library.ListMusic />)).toContain('queue-note');
  });

  it('falls back safely for a variant not drawn for the chosen glyph', async () => {
    const library = await icons();
    expect(renderToStaticMarkup(<library.Search variant="badge" />)).toBe(renderToStaticMarkup(<library.Search />));
    expect(renderToStaticMarkup(<library.Search variant="not-supported" />)).toBe(renderToStaticMarkup(<library.Search />));
  });
});
