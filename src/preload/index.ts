import { contextBridge, ipcRenderer } from 'electron';
import type { BriefingSnapshot } from '@shared/briefing';
import type { Meta, PropostaMetas, Retorno, SnapshotMetas } from '@shared/metas';
import type { EventoPostit, ResumoPostit, VisaoPostit } from '@shared/postits';
import type { StickyApi } from './api';

/** Assina um canal do processo principal; devolve a função que cancela. */
function assinar<T>(canal: string, cb: (v: T) => void): () => void {
  const h = (_e: unknown, v: T) => cb(v);
  ipcRenderer.on(canal, h);
  return () => { ipcRenderer.removeListener(canal, h); };
}

const chamar = <T>(canal: string, ...args: unknown[]) => ipcRenderer.invoke(canal, ...args) as Promise<T>;

const api: StickyApi = {
  briefing: {
    obter: () => chamar<BriefingSnapshot>('briefing:obter'),
    atualizar: () => chamar<void>('briefing:atualizar'),
    aoMudar: (cb) => assinar('briefing:mudou', cb),
  },
  metas: {
    obter: () => chamar<SnapshotMetas>('metas:obter'),
    criar: (entrada) => chamar<Retorno<Meta>>('metas:criar', entrada),
    atualizar: (id, campos) => chamar<Retorno<Meta>>('metas:atualizar', id, campos),
    excluir: (id) => chamar<Retorno>('metas:excluir', id),
    registrarAvanco: (id, nota) => chamar<Retorno<Meta>>('metas:avanco', id, nota),
    aoMudar: (cb) => assinar('metas:mudou', cb),
    propostas: () => chamar<PropostaMetas[]>('metas:propostas'),
    aplicarProposta: (id) => chamar<Retorno>('metas:aplicar-proposta', id),
    descartarProposta: (id) => chamar<void>('metas:descartar-proposta', id),
    aoMudarPropostas: (cb) => assinar('metas:propostas-mudou', cb),
  },
  postit: {
    obter: (id) => chamar<VisaoPostit | null>('postit:obter', id),
    enviar: (id, texto) => chamar<Retorno>('postit:enviar', id, texto),
    parar: (id) => chamar<void>('postit:parar', id),
    renomear: (id, nome) => chamar<Retorno>('postit:renomear', id, nome),
    cor: (id, cor) => chamar<Retorno>('postit:cor', id, cor),
    instrucoes: (id, texto) => chamar<Retorno>('postit:instrucoes', id, texto),
    topo: (id, valor) => chamar<Retorno>('postit:topo', id, valor),
    acessoGoogle: (id, valor) => chamar<Retorno>('postit:acesso-google', id, valor),
    ocultar: (id) => chamar<void>('postit:ocultar', id),
    excluir: (id) => chamar<Retorno>('postit:excluir', id),
    aoEvento: (cb) => assinar<EventoPostit>('postit:evento', cb),
  },
  postits: {
    listar: () => chamar<ResumoPostit[]>('postits:listar'),
    novo: () => chamar<Retorno<string>>('postits:novo'),
    alternar: (id) => chamar<void>('postits:alternar', id),
    aoMudar: (cb) => assinar<ResumoPostit[]>('postits:mudou', cb),
  },
};

contextBridge.exposeInMainWorld('sticky', api);
