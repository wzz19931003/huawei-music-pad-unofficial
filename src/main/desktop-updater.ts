import { app } from 'electron';
import updaterModule from 'electron-updater';
import { createUpdateManager } from './update-manager.mjs';
import { toUpdateView } from './update-view.mjs';
import { UPDATE_SOURCE } from './update-source.mjs';
import type { UpdateState } from '../shared/types';

/** Native NSIS transport stays in main; renderers never supply URLs or paths. */
export function createDesktopUpdater(onState: (state: UpdateState) => void) {
  const packaged = app.isPackaged && process.platform === 'win32';
  const transport = packaged ? new updaterModule.NsisUpdater({
    provider: 'github', owner: UPDATE_SOURCE.owner, repo: UPDATE_SOURCE.repo, releaseType: 'release',
  }) : undefined;
  if (transport) transport.logger = null;
  let checked = false;
  let previous = 'idle';
  const view = (state: ReturnType<ReturnType<typeof createUpdateManager>['getState']>) => toUpdateView(state, { checked }) as UpdateState;
  const manager = createUpdateManager({
    updater: transport,
    currentVersion: app.getVersion(),
    packaged,
    source: UPDATE_SOURCE,
    onState: state => {
      if (state.status === 'checking') checked = false;
      if (state.status === 'idle' && previous === 'checking') checked = true;
      previous = state.status;
      onState(view(state));
    },
  });
  return {
    getState: () => view(manager.getState()),
    check: async () => view(await manager.check()),
    download: async () => view(await manager.download()),
    install: async () => view(await manager.install()),
    dispose: () => manager.dispose(),
  };
}
