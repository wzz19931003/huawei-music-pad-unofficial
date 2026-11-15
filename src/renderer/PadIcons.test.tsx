import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// A dynamic import lets the first RED be an explicit missing-feature assertion,
// rather than a Vite resolution error before Vitest can execute the test.
const iconPath = './PadIcons.tsx';
async function icons() {
  return import(/* @vite-ignore */ iconPath).catch(() => ({})) as Promise<Record<string, any>>;
}

describe('screenshot-locked Pad icons', () => {
  it('renders the screenshot home as a solid house with a transparent rounded arch', async () => {
    const library = await icons();
    expect(library.Home, 'the custom Home SVG component must exist').toBeDefined();
    const svg = renderToStaticMarkup(<library.Home />);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('data-pad-icon="Home"');
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('data-part="rounded-arch-house"');
    expect(svg).not.toMatch(/<image|<use|lucide/);
  });

  it.each([
    ['Landmark', 'sloped-facade', 'M1.6 10.1 18.1 4.9 22.4 10V22H1.6Z'],
    ['Music2', 'organic-note-disc', 'M19.8 2.3C23.1 5.2 23.8 15.8 21.1 20.1'],
    ['RadioTower', 'broadcast-rings', 'M8 20.5a9.4 9.4 0 1 1 8 0'],
    ['CircleUserRound', 'user-disc', 'M12 1a11 11 0 1 0 0 22'],
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
    ['Play', 'rounded-play', 'M7 4.9Q5.9 4.3 5.9 5.65V18.35'],
    ['Pause', 'pause-bars', 'M8.4 5.5v13M15.6 5.5v13'],
    ['SkipForward', 'next-track', 'M4.35 5.3Q3.25 4.65 3.25 6V18'],
    ['ListMusic', 'queue-note', 'M2.2 5.2h9.4M2.2 12h8M2.2 18.8h4.7'],
    ['Heart', 'heart', 'M12 5.6C9.1 1.4 2.1 2.6 2.1 8.35'],
    ['HeartOff', 'dislike-slash', 'M2.35 2.35 21.65 21.65'],
    ['MoreVertical', 'circled-more', 'r="10"'],
    ['Repeat', 'circular-mode', 'M10.2 2.1a10 10 0 1 0 11.7 10.1'],
    ['Menu', 'menu-lines', 'M2 5.1h20M2 12h20M2 18.9h20'],
    ['Settings', 'soft-six-tooth-cog', 'M10.25 1.9h3.5'],
    ['Search', 'search-ring', 'r="7.6"'],
  ])('locks the observed %s control silhouette', async (name, part, signature) => {
    const library = await icons();
    expect(library[name], `${name} must be exported`).toBeDefined();
    const svg = renderToStaticMarkup(React.createElement(library[name]));
    expect(svg).toContain(`data-part="${part}"`);
    expect(svg).toContain(signature);
    expect(svg).toContain('data-icon-source="screenshot"');
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
    for (const name of ['HeartPulse', 'CheckCircle', 'Download', 'VolumeX', 'SkipBack', 'Repeat1', 'Shuffle', 'Trash2', 'ShieldCheck']) {
      expect(library[name], name).toBeDefined();
      expect(renderToStaticMarkup(React.createElement(library[name])), name).toContain('data-icon-source="original"');
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
    expect(outline.match(/d="M12 5.6[^\"]+/)?.[0]).toBe(saved.match(/d="M12 5.6[^\"]+/)?.[0]);
    const solid = renderToStaticMarkup(<library.Home fill="#e60045" />);
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
    expect(sleeve).toContain('data-part="playlist-sleeve"');
    expect(sleeve).not.toContain('queue-note');
    expect(renderToStaticMarkup(<library.ListMusic />)).toContain('queue-note');
  });

  it('falls back safely for a variant not drawn for the chosen glyph', async () => {
    const library = await icons();
    expect(renderToStaticMarkup(<library.Search variant="badge" />)).toBe(renderToStaticMarkup(<library.Search />));
    expect(renderToStaticMarkup(<library.Search variant="not-supported" />)).toBe(renderToStaticMarkup(<library.Search />));
  });
});
