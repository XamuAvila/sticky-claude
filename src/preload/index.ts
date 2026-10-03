import { contextBridge, ipcRenderer } from 'electron';
import type { BriefingSnapshot } from '@shared/briefing';
import type { StickyApi } from './api';

const api: StickyApi = {
  briefing: {
    obter: () => ipcRenderer.invoke('briefing:obter') as Promise<BriefingSnapshot>,
    atualizar: () => ipcRenderer.invoke('briefing:atualizar') as Promise<void>,
    aoMudar: (cb) => {
      const h = (_e: unknown, s: BriefingSnapshot) => cb(s);
      ipcRenderer.on('briefing:mudou', h);
      return () => { ipcRenderer.removeListener('briefing:mudou', h); };
    },
  },
};

contextBridge.exposeInMainWorld('sticky', api);
