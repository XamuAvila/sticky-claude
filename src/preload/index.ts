import { contextBridge, ipcRenderer } from 'electron';
import type { BriefingSnapshot } from '@shared/briefing';
import type { Meta, PropostaMetas, Retorno, SnapshotMetas } from '@shared/metas';
import type { StickyApi } from './api';

/** Assina um canal do processo principal; devolve a função que cancela. */
function assinar<T>(canal: string, cb: (v: T) => void): () => void {
  const h = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(canal, h);
  return () => { ipcRenderer.removeListener(canal, h); };
}

const api: StickyApi = {
  briefing: {
    obter: () => ipcRenderer.invoke('briefing:obter') as Promise<BriefingSnapshot>,
    atualizar: () => ipcRenderer.invoke('briefing:atualizar') as Promise<void>,
    aoMudar: (cb) => assinar('briefing:mudou', cb),
  },
  metas: {
    obter: () => ipcRenderer.invoke('metas:obter') as Promise<SnapshotMetas>,
    criar: (entrada) => ipcRenderer.invoke('metas:criar', entrada) as Promise<Retorno<Meta>>,
    atualizar: (id, campos) => ipcRenderer.invoke('metas:atualizar', id, campos) as Promise<Retorno<Meta>>,
    excluir: (id) => ipcRenderer.invoke('metas:excluir', id) as Promise<Retorno>,
    registrarAvanco: (id, nota) => ipcRenderer.invoke('metas:avanco', id, nota) as Promise<Retorno<Meta>>,
    aoMudar: (cb) => assinar('metas:mudou', cb),
    propostas: () => ipcRenderer.invoke('metas:propostas') as Promise<PropostaMetas[]>,
    aplicarProposta: (id) => ipcRenderer.invoke('metas:aplicar-proposta', id) as Promise<Retorno>,
    descartarProposta: (id) => ipcRenderer.invoke('metas:descartar-proposta', id) as Promise<void>,
    aoMudarPropostas: (cb) => assinar('metas:propostas-mudou', cb),
  },
};

contextBridge.exposeInMainWorld('sticky', api);
