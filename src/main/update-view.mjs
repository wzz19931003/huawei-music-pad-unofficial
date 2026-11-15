import { parseUpdateVersion } from './update-policy.mjs';
const MESSAGES = {
  unconfigured: '尚未配置有效的更新源，请使用完整安装包。',
  development: '开发模式不下载或安装更新，请使用已打包版本。',
  idle: '尚未检查更新', checking: '正在检查更新…',
  available: '发现新版本，可在后台下载。', downloading: '正在后台下载更新，音乐可继续播放。',
  downloaded: '更新包已完成完整性校验，确认后重启安装。', installing: '正在退出并安装更新…',
  error: '更新操作失败，请稍后重试。',
};
const ERRORS = {
  UPDATE_INSTALL_FAILED: '更新安装失败，可确认后重试安装。',
  UPDATE_DOWNLOAD_FAILED: '更新下载失败，可重试下载。',
  UPDATE_DOWNLOAD_UNVERIFIED: '下载未通过完整性确认，请重新下载。',
  UPDATE_CHECK_FAILED: '检查更新失败，请检查网络后重试。',
  UPDATE_VERSION_REJECTED: '更新版本无效或不高于当前版本，已拒绝。',
  UPDATE_SOURCE_INVALID: '更新源配置无效，已拒绝访问。',
  UPDATE_CURRENT_VERSION_INVALID: '当前版本信息无效，请使用完整安装包。',
  UPDATE_TRANSPORT_INVALID: '原生更新模块不可用，请使用完整安装包。',
  UPDATE_BUSY: '另一个更新操作正在进行，请稍候。',
  UPDATE_NOT_READY: '尚无可安装的已验证更新包。',
  UPDATE_DISPOSED: '更新服务已经关闭。',
  UPDATE_UNCONFIGURED: MESSAGES.unconfigured, UPDATE_DEVELOPMENT: MESSAGES.development,
};
/** Map only trusted primitive fields; raw transport messages never reach UI. */
export function toUpdateView(state, { checked = false } = {}) {
  const status = Object.hasOwn(MESSAGES, state?.status) ? state.status : 'error';
  const errorCode = Object.hasOwn(ERRORS, state?.errorCode) ? state.errorCode : undefined;
  return {
    status, currentVersion: parseUpdateVersion(state?.currentVersion) ?? '未知',
    version: parseUpdateVersion(state?.version) ?? undefined,
    progress: typeof state?.progress === 'number' && Number.isFinite(state.progress) ? Math.min(100, Math.max(0, state.progress)) : undefined,
    message: errorCode && status === 'error' ? ERRORS[errorCode] : status === 'idle' && checked ? '当前已是最新版本' : MESSAGES[status],
    errorCode,
  };
}
