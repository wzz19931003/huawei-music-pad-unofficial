import { RefreshCw } from './PadIcons';
import type { UpdateState } from '../shared/types';
import logo from './assets/app-icon.png';

export function AboutScreen(props: Parameters<typeof UpdatePanel>[0]) {
  return <div className="screen pad-about-screen">
    <div className="pad-about-brand"><img src={logo} alt="" /><div><h2>华为音乐（非官方）</h2><p>Pad 横屏客户端 · {props.state.currentVersion}</p></div></div>
    <UpdatePanel {...props} />
    <section className="pad-about-notices" aria-label="来源与许可"><h3>来源与许可</h3>
      <p>本地派生项目：wzz19931003/huawei-music-pad-unofficial。</p>
      <p>基于 Daydreamcgy/huawei-music-win，继承 talongao/huawei-music-desktop 的协议与基础结构；代码按 AGPL-3.0-only 分发，修改声明见 NOTICE。</p>
      <p>与华为无隶属、合作或授权关系。音乐与会员权益由你的华为账号决定；本项目不提供音源、不下载、不解密。</p>
      <p>更新来自本项目的 GitHub Releases，不来自华为或上游作者。当前构建未签名。</p>
    </section>
  </div>;
}

export function UpdatePanel({ state, actionError, busy = false, onCheck, onDownload, onInstall }: {
  state: UpdateState; actionError?: string | null; busy?: boolean; onCheck: () => void; onDownload: () => void; onInstall: () => void;
}) {
  const retryInstall = state.status === 'error' && state.errorCode === 'UPDATE_INSTALL_FAILED';
  const retryDownload = state.status === 'error' && ['UPDATE_DOWNLOAD_FAILED', 'UPDATE_DOWNLOAD_UNVERIFIED'].includes(state.errorCode ?? '');
  const disabled = busy || ['unconfigured', 'development', 'checking', 'downloading', 'installing', 'downloaded'].includes(state.status) || retryInstall;
  return <section className="pad-update-panel" aria-label="软件更新" data-update-status={state.status} aria-busy={busy || undefined}>
    <div className="pad-update-title"><RefreshCw /><div><h2>软件更新</h2><p>当前版本 {state.currentVersion} · 非官方客户端</p></div></div>
    <p role={state.status === 'error' ? 'alert' : 'status'} aria-live="polite">{state.message || '尚未检查更新'}</p>
    {actionError ? <p role="alert">{actionError}</p> : null}
    {state.status === 'downloading' ? <div className="pad-update-progress"><progress aria-label="更新下载进度" max={100} value={state.progress ?? 0} aria-valuenow={Math.round(state.progress ?? 0)} /><span>{Math.round(state.progress ?? 0)}%</span></div> : null}
    {state.status === 'downloaded' ? <p>更新包已下载并完成完整性校验，确认后保存进度并重启。</p> : null}
    {state.version ? <p className="pad-update-version">发现新版本 {state.version}</p> : null}
    <div className="pad-update-buttons">{state.status === 'downloaded' || retryInstall ? <button type="button" className="primary-button" disabled={busy} onClick={onInstall}>{retryInstall ? '重试安装' : '重启并更新'}</button> : null}{state.status === 'available' || retryDownload ? <button type="button" className="primary-button" disabled={busy} onClick={onDownload}>{retryDownload ? '重试下载' : '下载更新'}</button> : null}<button type="button" className="ghost-button" disabled={disabled} onClick={onCheck}>检查更新</button></div>
  </section>;
}
