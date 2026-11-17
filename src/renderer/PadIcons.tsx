import React, { forwardRef, type CSSProperties, type ReactNode, type SVGProps } from 'react';
import { getDesktopGlyph } from './DesktopGlyphs';

/**
 * Hand-redrawn application-internal glyphs, never app/tray identity assets.
 * "screenshot" means observed in the five supplied Pad references; it does not
 * claim a vendor source asset or a pixel-exact trace. All holes are transparent
 * compound paths: no screenshots, hardcoded background paint, or external use.
 */
/** Music2: plain note; Play/Pause: badge; ListMusic: sleeve; Heart: tile.
 * Other combinations fall back to the screenshot-locked default glyph.
 */
export type PadIconVariant = 'default' | 'plain' | 'badge' | 'sleeve' | 'tile';
export type PadIconProps = SVGProps<SVGSVGElement> & { size?: number | string; variant?: PadIconVariant; selected?: boolean };

function icon(name: string, source: 'screenshot' | 'original', drawing: ReactNode, weight = 1.7,
  variants: Partial<Record<PadIconVariant, ReactNode>> = {}) {
  const PadIcon = forwardRef<SVGSVGElement, PadIconProps>(function PadIcon(
    { size = 24, strokeWidth, variant = 'default', selected, className, style, fill, children, ...props }, ref,
  ) {
    const named = Boolean(props['aria-label'] || props['aria-labelledby']);
    const resolvedVariant = Object.hasOwn(variants, variant) ? variant : 'default';
    // Explicit fill also paints intrinsically solid compound silhouettes; their
    // transparent holes stay transparent on arbitrary glass/background colors.
    const solid = style?.fill ?? fill;
    const geometry = getDesktopGlyph(name, resolvedVariant, selected, solid);
    const iconStyle = solid === undefined ? style : { '--pad-icon-fill': solid, ...style } as CSSProperties;
    return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={geometry ? '0 0 32 32' : '0 0 24 24'}
      fill={fill ?? 'none'} stroke="currentColor" strokeWidth={strokeWidth ?? geometry?.weight ?? weight} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={props['aria-hidden'] ?? !named} role={named ? 'img' : undefined} focusable="false"
      data-pad-icon={name} data-icon-source={geometry?.source ?? source} data-icon-variant={resolvedVariant}
      data-control-glyph={geometry?.key} data-icon-reference-kind={geometry?.reference} {...props} ref={ref}
      className={className ? `pad-icon ${className}` : 'pad-icon'} style={iconStyle}>
      {children}{geometry?.drawing ?? variants[resolvedVariant] ?? drawing}
    </svg>;
  });
  PadIcon.displayName = name;
  return PadIcon;
}

// Legacy companion drawings below remain for variants outside the round-one
// scope. getDesktopGlyph supplies the corrected geometry and evidence metadata.
export const Home = icon('Home', 'screenshot', <>
  <path fill="none" d="M1.8 10.5 10.55 1.85Q12 .55 13.45 1.85L22.2 10.5" />
  <path data-part="rounded-arch-house" fill="var(--pad-icon-fill, currentColor)" fillRule="evenodd" stroke="none"
    d="M3.25 11.2 10.7 3.9Q12 2.65 13.3 3.9L20.75 11.2V21Q20.75 22 19.75 22H4.25Q3.25 22 3.25 21ZM8.8 22v-5.3a3.2 3.2 0 0 1 6.4 0V22Z" />
</>);

// Sloped roof + stepped right edge + three narrow open columns, NOT a temple.
export const Landmark = icon('Landmark', 'screenshot',
  <path data-part="sloped-facade" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd"
    d="M1.6 10.1 18.1 4.9 22.4 10V22H1.6ZM4.05 12.15V22H5.9V11.6ZM7.3 11.2V22H9.15V10.6ZM10.55 10.2V22H12.4V9.65Z" />);

// The note is knocked out of the slightly leaning, noncircular solid badge.
export const Music2 = icon('Music2', 'screenshot',
  <path data-part="organic-note-disc" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd"
    d="M19.8 2.3C23.1 5.2 23.8 15.8 21.1 20.1C18.5 23.1 8.9 23.5 4.2 21C-.1 18.8 .5 12.2 3.9 7.7C7.4 3.1 16.6-.5 19.8 2.3ZM8.25 8.3v7.8c-.8-.2-2.15.1-2.6 1-.85 1.7.65 2.65 2.35 2 1.3-.45 2-1.45 2-2.8V9.65l6.6-1.5v6.5c-.85-.2-2.35.2-2.8 1.1-.85 1.7.65 2.7 2.35 2.05 1.3-.5 2.1-1.5 2.1-2.85V5.7Q18.25 5 17.5 5.2L9 7.1q-.75.2-.75 1.2Z" />, 1.7, {
    plain: <path data-part="paired-note" fill="var(--pad-icon-fill, currentColor)" stroke="none"
      d="M7.3 6.8v10c-1.05-.2-2.7.2-3.3 1.35-1.1 2.1.8 3.35 2.95 2.5 1.65-.55 2.55-1.8 2.55-3.5V8.4l8.25-1.85v8.15c-1.05-.25-2.95.25-3.5 1.4-1.1 2.1.8 3.35 2.95 2.5 1.65-.6 2.65-1.85 2.65-3.55V3.5q0-.9-.95-.65L8.25 5.3q-.95.25-.95 1.5Z" />,
  });

export const RadioTower = icon('RadioTower', 'screenshot', <>
  <path data-part="broadcast-rings" fill="none"
    d="M8 20.5a9.4 9.4 0 1 1 8 0M8.15 16.9a6.15 6.15 0 1 1 7.7 0M9.65 13.55a3.1 3.1 0 1 1 4.7 0" />
  <path data-part="broadcast-foot" fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M12 13.9 7.8 22.1h8.4Z" />
</>, 2);

export const CircleUserRound = icon('CircleUserRound', 'screenshot',
  <path data-part="user-disc" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd"
    d="M12 1a11 11 0 1 0 0 22 11 11 0 0 0 0-22Zm0 4a3.55 3.55 0 1 1 0 7.1A3.55 3.55 0 0 1 12 5Zm0 9c-3.25 0-5.8 1.65-6.9 4.05a8.7 8.7 0 0 0 13.8 0C17.8 15.65 15.25 14 12 14Z" />);

// Transport controls are solid rounded triangles / round-ended bars. The
// organic light button surround is provided separately by the badge variant.
const transportBadge = 'M17.1 1.6C21.4 2.8 23.4 11 22.3 17.6C21.8 22.1 18.6 23.2 12 22.8C5.5 22.5 1.3 20.5 1.4 15.4C1.4 10.4 7.4 3.5 12.6 1.9Q15 .7 17.1 1.6Z';
export const Play = icon('Play', 'screenshot',
  <path data-part="rounded-play" fill="var(--pad-icon-fill, currentColor)" stroke="none"
    d="M7 4.9Q5.9 4.3 5.9 5.65V18.35q0 1.35 1.1.75l12-6.3q1.25-.8 0-1.6Z" />, 1.7, {
    badge: <path data-part="organic-transport-badge" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd"
      d={`${transportBadge}M10.3 7.3q-.9-.5-.9.55v8.3q0 1.05.9.55l6.8-4.1q.9-.6 0-1.2Z`} />,
  });
export const Pause = icon('Pause', 'screenshot',
  <path data-part="pause-bars" fill="none" d="M8.4 5.5v13M15.6 5.5v13" />, 2.6, {
    badge: <path data-part="organic-transport-badge" fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd"
      d={`${transportBadge}M9.2 7.1a1 1 0 0 0-1 1v8.6a1 1 0 0 0 2 0V8.1a1 1 0 0 0-1-1Zm5.6 0a1 1 0 0 0-1 1v8.6a1 1 0 0 0 2 0V8.1a1 1 0 0 0-1-1Z`} />,
  });
export const SkipForward = icon('SkipForward', 'screenshot', <g data-part="next-track">
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M4.35 5.3Q3.25 4.65 3.25 6V18q0 1.35 1.1.7l10.7-6q1.1-.7 0-1.4Z" />
  <path fill="none" d="M20.1 5.9v12.2" />
</g>, 2.15);

export const ListMusic = icon('ListMusic', 'screenshot', <g data-part="queue-note" fill="none">
  <path d="M2.2 5.2h9.4M2.2 12h8M2.2 18.8h4.7" />
  <path d="M19.9 17.5V5.2l2-1M19.9 17.5c-1.35-.75-4.75.15-5.55 1.8-.8 1.65.75 2.75 2.55 2.2 1.85-.55 3-1.6 3-4Z" />
</g>, 1.7, {
  sleeve: <g data-part="playlist-sleeve" fill="none">
    <path d="M3.3 3.8 15.6 2.4q1.4-.15 1.4 1.3v17q0 1.4-1.4 1.25L3.3 20.55q-1.2-.15-1.2-1.4V5.2q0-1.25 1.2-1.4ZM20 4.2v15.6M22.6 6.1v11.8M11.7 7.4v8.3q-1.6 2-3.3 1.25-1.4-.65.05-1.6 1.25-.75 3.25.35M8.2 8.2l3.5-.8" />
  </g>,
});

const heartPath = 'M12 5.6C9.1 1.4 2.1 2.6 2.1 8.35c0 4.5 4.8 8.6 8.95 12.55q.95.8 1.9 0C17.1 16.95 21.9 12.85 21.9 8.35c0-5.75-7-6.95-9.9-2.75Z';
export const Heart = icon('Heart', 'screenshot', <path data-part="heart" d={heartPath} />, 1.7, {
  tile: <g data-part="favorite-tile" fill="var(--pad-icon-fill, currentColor)" stroke="none">
    <path data-part="tile-top-rail" opacity=".45" d="M3.7 3.6q.25-1.8 2.25-1.8h12.1q2 0 2.25 1.8Z" />
    <path fillRule="evenodd" d="M3.8 5.3h16.4q2 0 2 2v13q0 2-2 2H3.8q-2 0-2-2v-13q0-2 2-2ZM12 11.1c-1.7-2.6-6-1.8-6 1.65 0 2.7 2.9 5.2 5.4 7.05q.6.45 1.2 0c2.5-1.85 5.4-4.35 5.4-7.05 0-3.45-4.3-4.25-6-1.65Z" />
  </g>,
});
// Kept separate from HeartPulse: the reference has a diagonal dislike slash,
// not an ECG line. Gaps in the heart contour keep the slash clean on glass.
export const HeartOff = icon('HeartOff', 'screenshot', <g fill="none">
  <path d="M7.4 3.4c1.8-.2 3.5.55 4.6 2.2 2.9-4.2 9.9-3 9.9 2.75 0 2.2-1.2 4.35-2.95 6.5M15.2 19c-.75.7-1.5 1.35-2.25 1.9q-.95.8-1.9 0C6.9 16.95 2.1 12.85 2.1 8.35q0-1.3.5-2.35" />
  <path data-part="dislike-slash" d="M2.35 2.35 21.65 21.65" />
</g>);
// The source really has two dots inside the ring, not three detached dots.
export const MoreVertical = icon('MoreVertical', 'screenshot', <g data-part="circled-more" fill="none">
  <circle cx="12" cy="12" r="10" />
  <g fill="var(--pad-icon-fill, currentColor)" stroke="none"><circle cx="12" cy="8.8" r="1.45" /><circle cx="12" cy="15.2" r="1.45" /></g>
</g>);

const circularMode = <path data-part="circular-mode" fill="none"
  d="M10.2 2.1a10 10 0 1 0 11.7 10.1M15 1.9l6.6 2.2-1.8 6.1M21.6 4.1c-4.5.1-8.2 3.5-9.2 8" />;
export const Repeat = icon('Repeat', 'screenshot', circularMode);
export const Menu = icon('Menu', 'screenshot',
  <path data-part="menu-lines" fill="none" d="M2 5.1h20M2 12h20M2 18.9h20" />);
export const Settings = icon('Settings', 'screenshot', <g data-part="soft-six-tooth-cog" fill="none">
  <path d="M10.25 1.9h3.5q.65 0 .9.7l.6 1.65q.75.3 1.4.8l1.7-.3q.75-.15 1.1.45l1.75 3.05q.3.55-.15 1.1l-1.15 1.3q.15 1.35 0 2.7l1.15 1.3q.45.55.15 1.1l-1.75 3.05q-.35.6-1.1.45l-1.7-.3q-.65.5-1.4.8l-.6 1.65q-.25.7-.9.7h-3.5q-.65 0-.9-.7l-.6-1.65q-.75-.3-1.4-.8l-1.7.3q-.75.15-1.1-.45L2.8 15.8q-.3-.55.15-1.1l1.15-1.3q-.15-1.35 0-2.7L2.95 9.4Q2.5 8.85 2.8 8.3l1.75-3.05q.35-.6 1.1-.45l1.7.3q.65-.5 1.4-.8l.6-1.65q.25-.7.9-.7Z" />
  <circle cx="12" cy="12.05" r="4.05" />
</g>);
export const Search = icon('Search', 'screenshot', <g fill="none">
  <circle data-part="search-ring" cx="10.3" cy="10.3" r="7.6" />
  <path d="m15.9 15.9 5.4 5.4" />
</g>);

// Observed secondary glyphs: home/hall category strip and Mine utilities.
// Names stay source-compatible; Sparkles is the reference's dissolving record,
// Waves its relaxation cloud-note, Shapes its rounded category index.
export const ChevronRight = icon('ChevronRight', 'screenshot', <path fill="none" d="m8.6 3.8 7.8 8.2-7.8 8.2" />);
export const Mail = icon('Mail', 'screenshot', <g fill="none">
  <rect x="1.8" y="3.1" width="20.4" height="17.8" rx="1.8" />
  <path d="m2.5 3.9 7.3 8.05q2.2 2.3 4.4 0l7.3-8.05" />
</g>);
export const HelpCircle = icon('HelpCircle', 'screenshot', <g fill="none">
  <circle cx="12" cy="12" r="10.4" /><path d="M8.6 8.1c.2-4.5 7.15-4.45 7.15-.1 0 2.85-3.75 2.6-3.75 5.5" />
  <circle cx="12" cy="17.35" r=".85" fill="var(--pad-icon-fill, currentColor)" stroke="none" />
</g>);
export const Ticket = icon('Ticket', 'screenshot', <g fill="none">
  <path d="M4 3.5h16q2 0 2 2v3.2a3.4 3.4 0 0 0 0 6.6v3.2q0 2-2 2H4q-2 0-2-2v-3.2a3.4 3.4 0 0 0 0-6.6V5.5q0-2 2-2Z" />
  <path d="M10.1 7.8v8.1q-1.6.3-2.3-1M14.1 16.2V7.9q1.7.1 2 1.8" />
</g>);
export const Star = icon('Star', 'screenshot',
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M10.2 2.85q1.35-2.75 2.8 0l2.25 4.4 4.9.8q3.05.45.9 2.65l-3.5 3.5.75 4.95q.45 3.1-2.3 1.7L11.6 18.6l-4.4 2.25q-2.75 1.4-2.3-1.7l.8-4.95-3.5-3.5Q.05 8.5 3.1 8.05l4.9-.8Z" />);
export const Piano = icon('Piano', 'screenshot', <g fill="none">
  <rect x="3" y="1.9" width="18" height="20.2" rx=".9" /><path d="M3 6.1h18M3 9h18M7.5 9v13.1M12 9v13.1M16.5 9v13.1" />
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M5.9 9h2.9v7.8H5.9ZM10.4 9h2.9v7.8h-2.9ZM14.9 9h2.9v7.8h-2.9Z" />
</g>);
export const CassetteTape = icon('CassetteTape', 'screenshot', <g fill="none">
  <rect x="1.8" y="3.5" width="20.4" height="17" rx="2.3" /><path d="m5.8 3.5 2.6 5.2h7.2l2.6-5.2M9.4 6h5.2" />
  <rect x="5.6" y="12" width="12.8" height="5.2" rx="2.6" /><circle cx="8.3" cy="14.6" r="1" /><circle cx="15.7" cy="14.6" r="1" />
</g>);
export const Disc3 = icon('Disc3', 'screenshot', <>
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd"
    d="M12 1.4a10.6 10.6 0 1 0 0 21.2 10.6 10.6 0 0 0 0-21.2Zm0 6.85a3.75 3.75 0 1 1 0 7.5 3.75 3.75 0 0 1 0-7.5Zm-8.15 4.1a8.2 8.2 0 0 0 7.8 7.8v-.85a7.35 7.35 0 0 1-6.95-6.95Zm2.15 0a6.05 6.05 0 0 0 5.65 5.65v-.85a5.2 5.2 0 0 1-4.8-4.8ZM17.4 2.95 21 6.6 15.65 10.1 13.9 8.35Z" />
  <circle fill="var(--pad-icon-fill, currentColor)" stroke="none" cx="12" cy="12" r="2.25" />
</>);
export const Guitar = icon('Guitar', 'screenshot', <g fill="none">
  <path d="M13.3 7.6c-2.6-.6-6.1.45-8.2 2.6-3.35 3.35-2.35 7.9.1 10 2.8 2.4 7 .65 8.65-2.55 1.3-2.5 1.85-5.05 1.45-7.65l6.4-6.9-1.8-1.5Z" />
  <path d="m6.9 11.2 5.8 5.5M5.4 13.4l5.6 5.3M8.9 9.6l5.2 5M4.3 16l4.1 3.7M12.2 6.25l5.1 4.5M15.75 2.7l5.45 4.8" />
</g>);
export const Mic2 = icon('Mic2', 'screenshot', <g fill="none">
  <g transform="rotate(10 12 10.8)"><rect x="5.6" y="1.8" width="12.8" height="16.6" rx="6.4" />
    <path d="M6.1 6h4M13.9 6h4M5.6 10.2h5M13.4 10.2h5M6.3 14.4h4M13.7 14.4h4" /></g>
  <path d="M12 18.6v3.5M8.3 22.1h7.4" />
</g>);
export const Trophy = icon('Trophy', 'screenshot', <g fill="none">
  <path d="M5 2.8h14v7.3c0 4-3.1 6.9-7 6.9s-7-2.9-7-6.9ZM5 4.6H2v4.1q0 4.8 4.6 4.9M19 4.6h3v4.1q0 4.8-4.6 4.9M12 17v4.2M8 22h8" />
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="m12 6.8 1 2.1 2.3.3-1.65 1.6.4 2.25L12 12l-2.05 1.05.4-2.25L8.7 9.2l2.3-.3Z" />
</g>);
export const Shapes = icon('Shapes', 'screenshot', <g fill="none">
  <rect x="4.2" y="1.6" width="15.6" height="20.8" rx="3.5" /><path d="M13.6 1.6v5.7h6.2M8.1 11.3h7.8M8.1 16h7.8" />
</g>);
export const Sparkles = icon('Sparkles', 'screenshot', <g fill="var(--pad-icon-fill, currentColor)" stroke="none">
  <path fillRule="evenodd" d="M12 3.9a9.1 9.1 0 1 1-8.1 8.1l3.4.3V9.5h2.9V6.6H12Zm1.1 7.6a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Z" />
  <path d="M1.8 2h2.5v2.5H1.8ZM5.2 5.2h2.6v2.6H5.2ZM2 8.8h2.8v2.8H2ZM8.5 1.8h2.7v2.7H8.5Z" />
</g>);
export const Waves = icon('Waves', 'screenshot', <>
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M6.5 15.8H5.1a4.6 4.6 0 0 1-.45-9.2 5 5 0 0 1 5.65-3.35 6.6 6.6 0 0 1 11.1 6.65q-.75 3.7-4 4.55V8.8q0-1.2-1.15-.95l-7.8 1.7q-1.05.2-1.05 1.4v4.85Z" />
  <path fill="none" d="M10 12.7v6.2q-.4 1.8-2.3 1.85-2.2-.05-1.25-1.75.8-1.2 3.55-.7M16.4 11.3v6.2q-.4 1.8-2.3 1.85-2.2-.05-1.25-1.75.8-1.2 3.55-.7M10 12.7l6.4-1.4" />
</>);

export const Folder = icon('Folder', 'screenshot', <g fill="var(--pad-icon-fill, currentColor)" stroke="none">
  <path opacity=".45" d="M3.7 3.6q.25-1.8 2.25-1.8h12.1q2 0 2.25 1.8Z" />
  <path fillRule="evenodd" d="M3.8 5.3h16.4q2 0 2 2v13q0 2-2 2H3.8q-2 0-2-2v-13q0-2 2-2Zm8.45 3.9v6.2c-1.6-.4-3.6.8-3.6 2.25 0 1.7 2.45 2.05 4 .7 1-.9 1.3-1.9 1.3-3.15V11q3.4-.85 3.4-3.15Z" />
</g>);
export const History = icon('History', 'screenshot', <>
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M5 1.8h12.5q3 0 3 3v11.05a5.1 5.1 0 0 0-7.1 6.35H5q-3 0-3-3V4.8q0-3 3-3ZM6.7 6.5v1.4h10.4V6.5Zm0 4.5v1.4h6.8V11Z" />
  <circle cx="18.1" cy="19.1" r="3.7" fill="none" /><path fill="none" d="M18.1 16.5v2.7l1.7 1.7" />
</>);
export const UsersRound = icon('UsersRound', 'screenshot', <>
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M13.7 15.6c-1.15 1.6-1.5 4.15-.3 6.4H3.5q-1.8 0-1.8-1.8c.2-4.55 3.6-7.5 7.6-7.5q3 0 4.4 2.9Z" />
  <circle cx="9.3" cy="6.3" r="4.6" fill="var(--pad-icon-fill, currentColor)" stroke="none" />
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" fillRule="evenodd" d="M18.5 13.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-2.6 4.6 1.6 1.55 3-3 .85.85-3.85 3.85-2.45-2.4Z" />
</>);
export const ListChecks = icon('ListChecks', 'screenshot', <path fill="none"
  d="m1.7 4.6 1.7 1.7 3.1-3.1M10.4 4.7h11.4M1.7 11.9l1.7 1.7 3.1-3.1M10.4 12h11.4M1.7 19.2l1.7 1.7 3.1-3.1M10.4 19.3h11.4" />);
export const RefreshCw = icon('RefreshCw', 'screenshot', circularMode);

// Reasonable ORIGINAL companions for controls absent from the supplied images.
// They share the optical scale and rounded endpoints, NOT an asserted reference.
export const ArrowUpRight = icon('ArrowUpRight', 'original', <path fill="none" d="M5.1 18.9 18.9 5.1M6.8 5.1h12.1v12.1" />);
export const AudioLines = icon('AudioLines', 'original', <path fill="none" d="M2.4 9v6M7.2 5.5v13M12 2.8v18.4M16.8 6.5v11M21.6 9v6" />);
export const BookOpen = icon('BookOpen', 'original', <path fill="none"
  d="M12 5.8C9.4 3.3 5.4 2.6 1.9 3.5v16c3.5-.9 7.5-.2 10.1 2.3 2.6-2.5 6.6-3.2 10.1-2.3v-16c-3.5-.9-7.5-.2-10.1 2.3Zm0 0v16M5 7.2q2.1-.2 4.2.9M5 11.2q2.1-.2 4.2.9M14.8 8.1q2.1-1.1 4.2-.9M14.8 12.1q2.1-1.1 4.2-.9" />);
export const CheckCircle = icon('CheckCircle', 'original', <g fill="none"><circle cx="12" cy="12" r="10.2" /><path d="m6.8 12.2 3.6 3.6 6.8-7.2" /></g>);
export const ChevronDown = icon('ChevronDown', 'original', <path fill="none" d="m3.8 8.6 8.2 7.8 8.2-7.8" />);
export const ChevronLeft = icon('ChevronLeft', 'original', <path fill="none" d="m15.4 3.8-7.8 8.2 7.8 8.2" />);
export const Copy = icon('Copy', 'original', <g fill="none"><rect x="7.4" y="7.4" width="14.6" height="14.6" rx="2.1" /><path d="M16.6 4.2v-.3q0-1.9-1.9-1.9H3.9Q2 2 2 3.9v10.8q0 1.9 1.9 1.9h.3" /></g>);
export const Download = icon('Download', 'original', <path fill="none" d="M12 2.3v13.1m-5-4.6 5 5 5-5M3 16.3v3.8q0 1.6 1.6 1.6h14.8q1.6 0 1.6-1.6v-3.8" />);
export const Headphones = icon('Headphones', 'original', <g fill="none"><path d="M3 13V11a9 9 0 0 1 18 0v2" /><rect x="2.2" y="11.8" width="4.7" height="9" rx="2.2" /><rect x="17.1" y="11.8" width="4.7" height="9" rx="2.2" /></g>);
export const HeartPulse = icon('HeartPulse', 'original', <g fill="none"><path d={heartPath} /><path d="M3 11.7h4.6l2-3.7 3.1 7 2.2-3.3H21" /></g>);
export const Info = icon('Info', 'original', <g fill="none"><circle cx="12" cy="12" r="10.3" /><path d="M12 10.8v6.7" /><circle cx="12" cy="6.8" r=".9" fill="var(--pad-icon-fill, currentColor)" stroke="none" /></g>);
export const ListPlus = icon('ListPlus', 'original', <path fill="none" d="M2.2 5.2h19.6M2.2 12h11.6M2.2 18.8h8M18.2 14.2v8M14.2 18.2h8" />);
export const ListStart = icon('ListStart', 'original', <g fill="none"><path d="M2.2 5.2h19.6M2.2 12h9.4M2.2 18.8h9.4" /><path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M16.5 10.1q-.8-.5-.8.5v10.6q0 1 .8.5l5.4-5.2q.6-.6 0-1.2Z" /></g>);
export const Loader2 = icon('Loader2', 'original', <path fill="none" d="M12 2a10 10 0 1 1-10 10" />);
export const LockKeyhole = icon('LockKeyhole', 'original', <g fill="none"><rect x="3.8" y="10.3" width="16.4" height="11.5" rx="2.5" /><path d="M7 10.3V7.1a5 5 0 0 1 10 0v3.2M12 15.1v3.2" /></g>);
export const LogIn = icon('LogIn', 'original', <path fill="none" d="M10.3 2.1h8.6q2.4 0 2.4 2.4v15q0 2.4-2.4 2.4h-8.6M1.8 12h13.5m-4.7-4.7 4.7 4.7-4.7 4.7" />);
export const LogOut = icon('LogOut', 'original', <path fill="none" d="M13.7 2.1H5.1q-2.4 0-2.4 2.4v15q0 2.4 2.4 2.4h8.6M10.3 12h12m-4.7-4.7 4.7 4.7-4.7 4.7" />);
export const Maximize2 = icon('Maximize2', 'original', <path fill="none" d="M14 2.4h7.6V10M21.6 2.4l-7.3 7.3M10 21.6H2.4V14M2.4 21.6l7.3-7.3" />);
export const Minus = icon('Minus', 'original', <path fill="none" d="M4 12h16" />);
export const Repeat1 = icon('Repeat1', 'original', <g fill="none">{circularMode}<path d="m9.1 11.1 2.4-1.7v8M8.9 17.4h5.3" /></g>);
export const ShieldCheck = icon('ShieldCheck', 'original', <g fill="none"><path d="M12 1.9c2.7 1.6 6 2.65 9.1 2.9v6.1c0 5.5-4.3 9-9.1 11.2-4.8-2.2-9.1-5.7-9.1-11.2V4.8c3.1-.25 6.4-1.3 9.1-2.9Z" /><path d="m7.5 11.7 3.1 3.1 5.9-6.2" /></g>);
export const Shuffle = icon('Shuffle', 'original', <path fill="none" d="M2.1 5.2h1.5c5.1 0 7.4 13.6 13.7 13.6h4.4m-3.6-3.6 3.6 3.6-3.6 3.6M2.1 18.8h1.5c2.2 0 3.9-2.1 5.5-5M12 9.3c1.6-2.5 3.2-4.1 5.3-4.1h4.4m-3.6-3.6 3.6 3.6-3.6 3.6" />);
export const SkipBack = icon('SkipBack', 'original', <g transform="translate(24 0) scale(-1 1)">
  <path fill="var(--pad-icon-fill, currentColor)" stroke="none" d="M4.35 5.3Q3.25 4.65 3.25 6V18q0 1.35 1.1.7l10.7-6q1.1-.7 0-1.4Z" />
  <path fill="none" d="M20.1 5.9v12.2" />
</g>, 2.15);
export const Square = icon('Square', 'original', <rect x="4" y="4" width="16" height="16" rx=".8" fill="none" />);
export const Trash2 = icon('Trash2', 'original', <path fill="none" d="M2.8 5.6h18.4M8.1 5.6V3q0-1 1-1h5.8q1 0 1 1v2.6M5 5.6l.9 14.6q.1 1.8 1.9 1.8h8.4q1.8 0 1.9-1.8L19 5.6M9.5 9.3v8.9M14.5 9.3v8.9" />);
export const UserRound = icon('UserRound', 'original', <g fill="none"><circle cx="12" cy="6.9" r="4.8" /><path d="M2.6 22c.3-5.9 4.6-8.5 9.4-8.5s9.1 2.6 9.4 8.5" /></g>);
const speaker = <path fill="none" d="M2 8.5h4.7l5-4.3v15.6l-5-4.3H2Z" />;
export const Volume1 = icon('Volume1', 'original', <g fill="none">{speaker}<path d="M15.6 8.1a5.5 5.5 0 0 1 0 7.8" /></g>);
export const Volume2 = icon('Volume2', 'original', <g fill="none">{speaker}<path d="M15.6 8.1a5.5 5.5 0 0 1 0 7.8M18.5 4.9a10 10 0 0 1 0 14.2" /></g>);
export const VolumeX = icon('VolumeX', 'original', <g fill="none">{speaker}<path d="m16 8.4 6 7.2M22 8.4l-6 7.2" /></g>);
export const X = icon('X', 'original', <path fill="none" d="m5.1 5.1 13.8 13.8M18.9 5.1 5.1 18.9" />);
