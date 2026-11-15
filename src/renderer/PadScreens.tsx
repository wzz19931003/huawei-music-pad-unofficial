import type { MouseEvent, ReactNode } from 'react';
import { ArrowUpRight, AudioLines, BookOpen, CassetteTape, ChevronRight, Disc3, Folder, Guitar, Headphones, Heart, HelpCircle, History, ListChecks, ListMusic, LockKeyhole, Mic2, Music2, Piano, Play, RefreshCw, Info, Settings, Shapes, Sparkles, Star, Ticket, Trophy, UserRound, UsersRound, Waves } from './PadIcons';
import type { Playlist, Track } from '../shared/types';
import { artistsOf, Cover, EmptyState, SkeletonRows } from './ui';
import './pad-screens.css';

/** Only presentation and parent-owned actions; no service calls or account state. */
export type PadScreenProps = {
  authenticated: boolean;
  displayName?: string;
  favorites: Track[];
  history: Track[];
  playlists: Playlist[];
  total: number;
  loading: boolean;
  currentId?: string;
  playing: boolean;
  onPlay: (tracks: Track[], index: number) => void;
  onOpenFavorites: () => void;
  onOpenPlaylist: (playlist: Playlist) => void;
  onOpenPlaylists: () => void;
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  onCheckUpdates: () => void;
  onOpenAbout: () => void;
  onLogin: () => void;
  onNotice: (message: string) => void;
  onOpenHistory: () => void;
  onToggleFavorite: (track: Track) => void;
  onTrackMenu?: (track: Track, event: MouseEvent) => void;
};

function FeatureCard({ tone, label, title, subtitle, top, art, glyph, unavailable, onClick }: {
  tone: string; label: string; title: string; subtitle: string;
  top: ReactNode; art: ReactNode; glyph?: ReactNode;
  unavailable?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`pad-feature-card pad-feature-${tone}`} aria-label={label}
      aria-disabled={unavailable || undefined} onClick={onClick}>
      <span className="pad-feature-top">{top}</span>
      <span className="pad-feature-art" aria-hidden="true">{art}</span>
      <span className="pad-feature-footer">
        <span className="pad-feature-copy"><strong>{title}</strong><span>{subtitle}</span></span>
        <span className="pad-feature-glyph" aria-hidden="true">{glyph ?? <Play fill="currentColor" />}</span>
      </span>
    </button>
  );
}

function CollectionArt() {
  return <span className="pad-collection-art"><span className="pad-paper-disc" /><span className="pad-collection-type">我的<br />音乐</span><Music2 /></span>;
}

// An auth update can precede the parent's library reset by one render.
function accountProps(props: PadScreenProps): PadScreenProps {
  return props.authenticated ? props : { ...props, displayName: undefined, favorites: [], history: [], playlists: [], total: 0 };
}

function playFrom(props: PadScreenProps, tracks: Track[], index: number) {
  if (!props.authenticated) { props.onLogin(); return; }
  const track = tracks[index];
  if (!track) return;
  if (!track.available) { props.onNotice(`「${track.title}」暂不可播放。`); return; }
  props.onPlay(tracks, index);
}

function Category({ label, icon, selected, unavailable, onClick }: {
  label: string; icon: ReactNode; selected?: boolean; unavailable?: boolean; onClick?: () => void;
}) {
  const content = <>{icon}<span>{label}</span>{unavailable ? <small>未接入</small> : null}</>;
  return selected ? <span className="pad-category is-selected" aria-current="page">{content}</span> :
    <button type="button" className="pad-category" aria-label={unavailable ? `${label}，未接入` : label === '歌单' ? '打开歌单' : label}
      aria-disabled={unavailable || undefined} onClick={onClick}>{content}</button>;
}

function SectionTitle({ title, action, actionLabel, onAction, play }: {
  title: string; action?: string; actionLabel?: string; onAction?: () => void; play?: () => void;
}) {
  return <div className="pad-section-title"><div><h2>{title}</h2>{play ?
    <button type="button" className="pad-section-play" aria-label={`播放${title}`} onClick={play}><Play fill="currentColor" /></button> : null}</div>
    {onAction ? <button type="button" className="pad-section-more" aria-label={actionLabel ?? action} onClick={onAction}>{action}<ChevronRight /></button> : null}</div>;
}

function SongGrid({ tracks, props }: { tracks: Track[]; props: PadScreenProps }) {
  const favoriteIds = new Set(props.favorites.map(track => track.id));
  return <div className="pad-song-grid">{[0, 1, 2].map(column => <div className="pad-song-column" key={column}>
    {tracks.slice(column * 3, column * 3 + 3).map((track, offset) => <div className="pad-song-row" data-track-id={track.id}
      data-active={props.currentId === track.id} key={`${track.id}-${offset}`}
      onContextMenu={props.onTrackMenu ? event => { event.preventDefault(); props.onTrackMenu?.(track, event); } : undefined}>
      <button type="button" className="pad-song-play" aria-label={`播放：${track.title}`} aria-disabled={!track.available || undefined}
        onClick={() => playFrom(props, tracks, column * 3 + offset)}>
        <span className="pad-song-cover"><Cover key={track.coverUrl ?? 'empty'} src={track.coverUrl} size={53} radius={8} />
          {props.currentId === track.id && props.playing ? <span className="pad-song-playing"><AudioLines /></span> : null}</span>
        <span className="pad-song-meta"><strong>{track.title}</strong><span>{!track.available ? <small>暂不可播放 · </small> : null}{artistsOf(track)}</span></span>
      </button>
      <button type="button" className="pad-song-heart" aria-label={`${favoriteIds.has(track.id) ? '取消收藏' : '收藏'}：${track.title}`}
        aria-pressed={favoriteIds.has(track.id)} onClick={() => props.onToggleFavorite(track)}>
        <Heart fill={favoriteIds.has(track.id) ? 'currentColor' : 'none'} />
      </button>
    </div>)}
  </div>)}</div>;
}

export function PadHomeScreen(input: PadScreenProps) {
  const props = accountProps(input);
  const openFavorites = props.authenticated ? props.onOpenFavorites : props.onLogin;
  const historyIndex = props.history.findIndex(track => track.id === props.currentId);
  const favoriteIndex = props.favorites.findIndex(track => track.id === props.currentId);
  const resumeFromHistory = historyIndex >= 0 || (favoriteIndex < 0 && props.history.length > 0);
  const resumeTracks = resumeFromHistory ? props.history : props.favorites;
  const resumeIndex = Math.max(0, resumeTracks === props.history ? historyIndex : favoriteIndex);
  const resume = resumeTracks[resumeIndex];
  const saved = props.favorites[0];
  const favoriteSummary = props.loading ? '正在读取收藏…' : props.total > 0 ? `已收藏 ${props.total} 首` : props.favorites.length ? `已加载 ${props.favorites.length} 首` : '还没有收藏音乐';
  const songs = props.favorites.length ? props.favorites : props.history;
  const artist = [...props.history, ...props.favorites].find(track => track.artists[0]?.name)?.artists[0]?.name;
  return (
    <div className="pad-screen pad-home" aria-label="首页内容" aria-busy={props.loading}>
      <section className="pad-home-features" aria-label="音乐快捷入口">
        <FeatureCard tone="collection" label="打开我的收藏" title="我的收藏"
          subtitle={props.authenticated ? favoriteSummary : '登录后查看你的音乐'}
          top={<><Music2 /> MY MUSIC</>} art={<CollectionArt />} glyph={<ArrowUpRight />} onClick={openFavorites} />
        <FeatureCard tone="listen" label="继续最近播放" title="现在就听"
          subtitle={resume ? `${resume.title} · ${artistsOf(resume)}` : '从最近播放继续'}
          top={<><Headphones /> {props.playing && resume?.id === props.currentId ? '正在播放' : 'Music'}</>}
          art={<Cover key={resume?.coverUrl ?? 'empty'} src={resume?.coverUrl} className="pad-feature-cover" radius={5} />}
          glyph={props.playing && resume?.id === props.currentId ? <AudioLines /> : undefined}
          onClick={!props.authenticated ? props.onLogin : resume ? () => playFrom(props, resumeTracks, resumeIndex) : props.onOpenHistory} />
        <FeatureCard tone="daily" label="每日30首，未接入" title="每日30首" subtitle="每日推荐尚未接入"
          top={<><Music2 /> DAILY <span className="pad-unavailable">未接入</span></>}
          art={<span className="pad-daily-art"><i /><i /><i /><i /><b>30</b></span>}
          glyph={<LockKeyhole />} unavailable onClick={() => props.onNotice('每日推荐尚未接入，不提供替代推荐。')} />
        <FeatureCard tone="saved" label="查看最近收藏" title="最近收藏"
          subtitle={saved ? `${saved.title} · ${artistsOf(saved)}` : '把喜欢的歌，留在身边'}
          top={<><Heart /> FAVORITES</>}
          art={<Cover key={saved?.coverUrl ?? 'empty'} src={saved?.coverUrl} className="pad-feature-cover pad-sleeve" radius={3} />}
          onClick={props.authenticated && saved ? () => playFrom(props, props.favorites, 0) : openFavorites} />
      </section>
      <nav className="pad-categories pad-home-categories" aria-label="首页分类">
        <Category label="精选" icon={<Star fill="currentColor" />} selected />
        <Category label="歌单" icon={<ListMusic variant="sleeve" />} onClick={props.authenticated ? props.onOpenPlaylists : props.onLogin} />
        <Category label="歌手" icon={<Mic2 />} onClick={() => artist ? props.onSearch(artist) : props.onNotice('还没有可浏览的歌手，可以先用顶部搜索寻找音乐。')} />
        <Category label="排行榜" icon={<Trophy />} unavailable onClick={() => props.onNotice('排行榜尚未接入。')} />
        <Category label="分类" icon={<Shapes />} unavailable onClick={() => props.onNotice('曲库分类尚未接入。')} />
      </nav>
      <section className="pad-song-section" aria-label={props.favorites.length ? '收藏音乐' : '最近播放'}>
        <SectionTitle title={props.favorites.length ? '收藏里的好音乐' : '最近播放'} action="查看全部" actionLabel={props.favorites.length ? '查看更多收藏' : '查看更多最近播放'}
          onAction={props.favorites.length ? openFavorites : props.authenticated ? props.onOpenHistory : props.onLogin}
          play={songs.length ? () => playFrom(props, songs, 0) : undefined} />
        {songs.length ? <SongGrid tracks={songs} props={props} /> : props.loading ? <SkeletonRows count={3} /> :
          <div className="pad-empty"><EmptyState title={props.authenticated ? '从一首喜欢的歌开始' : '登录，遇见你收藏的好音乐'}
            hint={props.authenticated ? '收藏和播放过的音乐会出现在这里' : '你的收藏、歌单和最近播放将在这里呈现'} /></div>}
      </section>
    </div>
  );
}

function TrackTile({ track, tracks, index, props, source }: {
  track: Track; tracks: Track[]; index: number; props: PadScreenProps; source: string;
}) {
  const active = props.currentId === track.id;
  return <button type="button" className="pad-track-tile" data-active={active} aria-label={`播放${source}：${track.title}`}
    aria-disabled={!track.available || undefined} onClick={() => playFrom(props, tracks, index)}
    onContextMenu={props.onTrackMenu ? event => { event.preventDefault(); props.onTrackMenu?.(track, event); } : undefined}>
    <span className="pad-tile-art"><Cover key={track.coverUrl ?? 'empty'} src={track.coverUrl} radius={9} />
      <span className="pad-tile-play" aria-hidden="true">{!track.available ? <LockKeyhole /> : active && props.playing ? <AudioLines /> : <Play fill="currentColor" />}</span>
    </span>
    <strong className="pad-tile-title">{track.title}</strong>
    <span className="pad-tile-sub">{!track.available ? '暂不可播放 · ' : ''}{artistsOf(track)}</span>
  </button>;
}

function EmptyCovers({ loading, label, onClick }: { loading: boolean; label: string; onClick: () => void }) {
  return <div className="pad-empty-covers"><div className="pad-cover-row" aria-hidden="true">
    {Array.from({ length: 7 }, (_, index) => <span className="pad-blank-cover" key={index}><Music2 /></span>)}
  </div><div className="pad-cover-empty-message" role="status"><span>{loading ? '正在读取音乐…' : label}</span>
    {!loading ? <button type="button" className="pad-small-action" onClick={onClick}>去看看 <ChevronRight /></button> : null}</div></div>;
}

export function PadHallScreen(input: PadScreenProps) {
  const props = accountProps(input);
  const recent = props.history[0];
  const playlist = props.playlists[0];
  const songs = props.favorites.length ? props.favorites : props.history;
  const source = props.favorites.length ? '收藏' : '最近播放';
  const showFavorites = props.favorites.length > 0 || props.history.length === 0;
  const songSectionTitle = showFavorites ? '收藏音乐' : '最近播放';
  const artists = [...new Map(props.history.flatMap(track => track.artists.filter(artist => artist.name).map(artist => [artist.name, artist] as const))).values()].slice(0, 8);
  const channels = [
    { label: '特别企划', icon: <Sparkles /> }, { label: '古典音乐', icon: <Piano /> },
    { label: '放松减压', icon: <Waves /> }, { label: '非遗音乐', icon: <Guitar /> },
    { label: '年代之声', icon: <CassetteTape /> }, { label: '母带专区', icon: <Disc3 /> },
  ];
  return <div className="pad-screen pad-hall" aria-label="音乐厅内容" aria-busy={props.loading}>
    <section className="pad-hall-banners" aria-label="音乐与歌单">
      <button type="button" className="pad-hall-banner pad-banner-recents" aria-label="播放最近听过的音乐"
        onClick={() => recent ? playFrom(props, props.history, 0) : props.authenticated ? props.onOpenHistory() : props.onLogin()}>
        {recent?.coverUrl ? <Cover key={recent.coverUrl} src={recent.coverUrl} className="pad-banner-background" radius={19} /> :
          <span className="pad-banner-placeholder" aria-hidden="true"><span>最近<br />播放</span><Disc3 /></span>}
        <span className="pad-banner-shade" />
        <span className="pad-banner-caption"><span className="pad-caption-tag">最近</span><strong>{recent ? `${recent.title} · ${artistsOf(recent)}` : '从你听过的音乐，继续发现喜欢'}</strong></span>
      </button>
      <button type="button" className="pad-hall-banner pad-banner-playlists" aria-label={playlist ? `打开歌单：${playlist.title}` : '浏览我的歌单'}
        onClick={!props.authenticated ? props.onLogin : playlist ? () => props.onOpenPlaylist(playlist) : props.onOpenPlaylists}>
        <span className="pad-banner-record" aria-hidden="true"><Disc3 /></span>
        <Cover key={playlist?.coverUrl ?? 'empty'} src={playlist?.coverUrl} className="pad-banner-album" radius={2} />
        <span className="pad-banner-shade" />
        <span className="pad-banner-caption"><span className="pad-caption-tag">歌单</span><strong>{playlist?.title ?? '我的歌单，收下每一种心情'}</strong></span>
      </button>
    </section>
    <nav className="pad-categories" aria-label="音乐厅分类">
      <Category label="精选" icon={<Star fill="currentColor" />} selected />
      {channels.map(channel => <Category key={channel.label} {...channel} unavailable onClick={() => props.onNotice(`${channel.label}频道尚未接入。`)} />)}
    </nav>
    <section aria-label={songSectionTitle}>
      <SectionTitle title={songSectionTitle} action="查看全部" onAction={!props.authenticated ? props.onLogin : showFavorites ? props.onOpenFavorites : props.onOpenHistory} />
      {songs.length ? <div className="pad-cover-row">{songs.slice(0, 7).map((track, index) =>
        <TrackTile key={`${track.id}-${index}`} track={track} tracks={songs} index={index} props={props} source={source} />)}</div> :
        <EmptyCovers loading={props.loading} label={props.authenticated ? '收藏的音乐会在这里与你见面' : '登录后，展示你的收藏音乐'} onClick={props.authenticated ? props.onOpenFavorites : props.onLogin} />}
    </section>
    <section aria-label="我的歌单预览">
      <SectionTitle title="我的歌单" action="查看全部" actionLabel="浏览所有歌单" onAction={props.authenticated ? props.onOpenPlaylists : props.onLogin} />
      {props.playlists.length ? <div className="pad-cover-row">{props.playlists.slice(0, 7).map(playlist =>
        <button type="button" className="pad-playlist-tile" key={playlist.id} aria-label={`查看歌单：${playlist.title}`}
          onClick={() => props.authenticated ? props.onOpenPlaylist(playlist) : props.onLogin()}>
          <span className="pad-tile-art"><Cover key={playlist.coverUrl ?? 'empty'} src={playlist.coverUrl} radius={9} />
            <span className="pad-tile-play" aria-hidden="true"><ListMusic /></span></span>
          <strong className="pad-tile-title">{playlist.title}</strong>
          <span className="pad-tile-sub">{playlist.count === undefined ? '歌单' : `${playlist.count} 首`}</span>
        </button>)}</div> : <div className="pad-compact-empty">{props.loading ? '正在读取歌单…' : props.authenticated ? '还没有歌单' : '登录后查看你的歌单'}</div>}
    </section>
    {artists.length ? <section aria-label="播放记录中的歌手"><SectionTitle title="最近听到的歌手" />
      <div className="pad-artist-row">{artists.map(artist => <button type="button" className="pad-artist" key={artist.name}
        aria-label={`搜索歌手：${artist.name}`} onClick={() => props.onSearch(artist.name)}>
        <span className="pad-artist-initial" aria-hidden="true">{artist.name.slice(0, 1)}</span><strong>{artist.name}</strong>
      </button>)}</div></section> : null}
  </div>;
}

function LibraryMetric({ label, actionLabel, value, icon, unavailable, onClick }: {
  label: string; actionLabel: string; value: string; icon: ReactNode; unavailable?: boolean; onClick: () => void;
}) {
  return <button type="button" className="pad-library-metric" aria-label={actionLabel} aria-disabled={unavailable || undefined} onClick={onClick}>
    <span className="pad-metric-icon" aria-hidden="true">{icon}</span><strong>{label}</strong><small>{value}</small>
  </button>;
}

export function PadMineScreen(input: PadScreenProps) {
  const props = accountProps(input);
  const owned = props.playlists.filter(playlist => playlist.kind === 'owned');
  const collected = props.playlists.filter(playlist => playlist.kind === 'collected');
  const openLibrary = (action: () => void) => props.authenticated ? action : props.onLogin;
  const favoriteValue = !props.authenticated ? '登录查看' : props.loading ? '读取中' : props.total > 0 ? `${props.total} 首` : `已加载 ${props.favorites.length} 首`;
  return <div className="pad-screen pad-mine" aria-label="我的内容" aria-busy={props.loading}>
    <div className="pad-mine-top">
      <section className="pad-account-panel" aria-label="我的账号">
        <button type="button" className="pad-account-profile" aria-label={props.authenticated ? '查看账号设置' : '登录华为账号'}
          onClick={openLibrary(props.onOpenSettings)}>
          <span className="pad-account-avatar" aria-hidden="true">{props.authenticated && props.displayName ? props.displayName.slice(0, 1) : <UserRound />}</span>
          <span className="pad-account-meta"><strong>{props.authenticated ? props.displayName ?? '已登录' : '登录华为账号'}<ChevronRight /></strong>
            <small>{props.authenticated ? '个人音乐库' : '收藏、歌单与最近播放，登录后同步'}</small></span>
        </button>
        <div className="pad-account-bottom"><span>会员信息 <small>未接入</small></span>
          <button type="button" className="pad-account-settings" aria-label="账号设置" onClick={openLibrary(props.onOpenSettings)}>{props.authenticated ? '账号设置' : '立即登录'}</button>
        </div>
      </section>
      <section className="pad-library-panel" aria-label="我的音乐库">
        <LibraryMetric label="本地" actionLabel="本地音乐，未接入" value="未接入" icon={<Folder />} unavailable onClick={() => props.onNotice('本地音乐尚未接入，不提供下载或离线导出。')} />
        <LibraryMetric label="最近播放" actionLabel="打开最近播放" value={!props.authenticated ? '登录查看' : props.loading ? '读取中' : `已加载 ${props.history.length} 首`}
          icon={<History />} onClick={openLibrary(props.onOpenHistory)} />
        <LibraryMetric label="收藏" actionLabel="打开我的收藏" value={favoriteValue} icon={<Heart variant="tile" fill="currentColor" />} onClick={openLibrary(props.onOpenFavorites)} />
        <LibraryMetric label="关注" actionLabel="关注歌手，未接入" value="未接入" icon={<UsersRound />} unavailable onClick={() => props.onNotice('关注歌手列表尚未接入。')} />
        <LibraryMetric label="歌单" actionLabel="打开我的歌单" value={!props.authenticated ? '登录查看' : props.loading ? '读取中' : `已加载 ${props.playlists.length} 个`}
          icon={<ListMusic variant="sleeve" />} onClick={openLibrary(props.onOpenPlaylists)} />
      </section>
    </div>
    <section className="pad-mine-playlists" aria-label="已加载的歌单">
      <div className="pad-mine-playlist-head"><h2>自建歌单{props.authenticated && !props.loading ? ` ${owned.length}` : ''}<span>｜收藏歌单{props.authenticated && !props.loading ? ` ${collected.length}` : ''}</span></h2>
        <button type="button" className="pad-mine-manage" aria-label="管理我的歌单" title="管理我的歌单" onClick={openLibrary(props.onOpenPlaylists)}><ListChecks /></button>
      </div>
      <div className="pad-mine-playlist-grid">
        <button type="button" className="pad-mine-playlist" aria-label="浏览全部歌单" onClick={openLibrary(props.onOpenPlaylists)}>
          <span className="pad-all-playlists-art" aria-hidden="true"><ListMusic /></span><span className="pad-mine-playlist-text"><strong>我的歌单</strong>
            <small>{props.loading ? '正在读取…' : props.authenticated ? '整理喜欢的音乐' : '登录后查看'}</small></span><ChevronRight />
        </button>
        {props.playlists.slice(0, 5).map(playlist => <button type="button" className="pad-mine-playlist" key={playlist.id} aria-label={`打开歌单：${playlist.title}`}
          onClick={openLibrary(() => props.onOpenPlaylist(playlist))}>
          <Cover key={playlist.coverUrl ?? 'empty'} src={playlist.coverUrl} size={53} radius={8} />
          <span className="pad-mine-playlist-text"><strong>{playlist.title}</strong><small>{playlist.count === undefined ? '歌单' : `${playlist.count} 首`}</small></span><ChevronRight />
        </button>)}
      </div>
    </section>
    <button type="button" className="pad-mine-rewards" aria-label="权益兑换，未接入" aria-disabled={true} onClick={() => props.onNotice('权益兑换尚未接入。')}>
      <Ticket /><strong>权益兑换</strong><small>未接入</small><ChevronRight />
    </button>
    <div className="pad-mine-utilities">
      <button type="button" aria-label="检查更新" onClick={props.onCheckUpdates}><RefreshCw /><strong>检查更新</strong><ChevronRight /></button>
      <button type="button" aria-label="关于" onClick={props.onOpenAbout}><Info /><strong>关于</strong><ChevronRight /></button>
      <button type="button" aria-label="设置" onClick={props.onOpenSettings}><Settings /><strong>设置</strong><ChevronRight /></button>
      <button type="button" aria-label="帮助和反馈" onClick={() => props.onNotice('这是非官方客户端。账号、播放和缓存选项可在设置中查看。')}><HelpCircle /><strong>帮助和反馈</strong><ChevronRight /></button>
    </div>
  </div>;
}

const cafeAtmosphere = new URL('./assets/pad-cafe-atmosphere.webp', import.meta.url).href;

export function PadCafeScreen(props: PadScreenProps) {
  const books = ['文学', '评书', '历史', '人文'];
  const genres = [
    { label: '播客', english: 'PODCAST', tone: 'coral' },
    { label: '有声书', english: 'AUDIOBOOK', tone: 'forest' },
    { label: '相声', english: 'COMEDY', tone: 'ink' },
    { label: '评书', english: 'STORYTELLING', tone: 'rose' },
    { label: '历史', english: 'HISTORY', tone: 'paper' },
    { label: '人文', english: 'CULTURE', tone: 'lilac' },
    { label: '儿童', english: 'CHILDREN', tone: 'cream' },
  ];
  return <div className="pad-screen pad-cafe" aria-label="café听内容">
    <section className="pad-cafe-banner" aria-label="有声内容尚未接入">
      <img src={cafeAtmosphere} className="pad-cafe-atmosphere" alt="" draggable={false} />
      <div className="pad-cafe-mist" aria-hidden="true" />
      <div className="pad-cafe-copy"><h2>耳畔说书笑谈</h2><p>吹散心头愁绪，卸下整日疲惫</p>
        <span className="pad-cafe-status"><Headphones /> 有声内容尚未接入</span></div>
      <div className="pad-cafe-books" aria-label="听书分类">
        {books.map((label, index) => <button type="button" className={`pad-cafe-book pad-book-${index}`} key={label}
          aria-label={`${label}，未接入`} aria-disabled={true} onClick={() => props.onNotice(`${label}有声内容尚未接入。`)}>
          <span className="pad-book-cover" aria-hidden="true"><span>有声 · 听书</span><strong>{label}</strong><BookOpen /></span>
          <span className="pad-book-label">{label}<small>未接入</small></span>
        </button>)}
      </div>
    </section>
    <section aria-label="有声内容分类">
      <div className="pad-cafe-section-title"><SectionTitle title="有声内容" /><span className="pad-unavailable">未接入</span></div>
      <div className="pad-cover-row pad-cafe-genres">
        {genres.map(genre => <button type="button" className={`pad-genre-tile pad-genre-${genre.tone}`} key={genre.label}
          aria-label={`${genre.label}，未接入`} aria-disabled={true} onClick={() => props.onNotice(`${genre.label}内容服务尚未接入。`)}>
          <span className="pad-genre-art" aria-hidden="true"><span className="pad-genre-english">{genre.english}</span>
            <strong>{genre.label}</strong><Headphones /><span className="pad-genre-state">未接入</span></span>
          <span className="pad-tile-title">{genre.label}</span>
        </button>)}
      </div>
    </section>
  </div>;
}
