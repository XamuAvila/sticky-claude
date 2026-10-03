import type { IpcMain } from 'electron';
import { DIAS_PARADA_PADRAO } from '@shared/metas';
import { lerConfig } from '../config';
import type { Logger } from '../log';
import type { Propostas } from './propostas';
import { tratar, type MetasStore } from './store';

interface Opcoes {
  ipc: IpcMain;
  store: MetasStore;
  propostas: Propostas;
  /** Envia um evento para a janela do painel. */
  enviar: (canal: string, valor: unknown) => void;
  /** Chamado quando chega uma proposta nova (a tela traz o painel para a frente). */
  aoChegarProposta: () => void;
  log: Logger;
}

/** Liga as metas à tela. A tela nunca grava no disco: tudo passa por aqui, com validação (zod) no processo principal. */
export function registrarIpcMetas({ ipc, store, propostas, enviar, aoChegarProposta, log }: Opcoes): void {
  const completo = () => ({ ...store.snapshot(), diasParada: lerConfig().metasParadaDias ?? DIAS_PARADA_PADRAO });
  ipc.handle('metas:obter', completo);

  ipc.handle('metas:criar', (_e, entrada: unknown) => {
    const r = tratar(() => store.criar(entrada));
    log.info('meta criada', { ok: r.ok });
    return r;
  });
  ipc.handle('metas:atualizar', (_e, id: unknown, campos: unknown) => {
    const r = tratar(() => store.atualizar(String(id), campos));
    log.info('meta atualizada', { ok: r.ok });
    return r;
  });
  ipc.handle('metas:excluir', (_e, id: unknown) => {
    const r = tratar(() => store.excluir(String(id)));
    log.info('meta excluída', { ok: r.ok });
    return r;
  });
  ipc.handle('metas:avanco', (_e, id: unknown, nota: unknown) => {
    const r = tratar(() => store.registrarAvanco(String(id), typeof nota === 'string' ? nota : undefined));
    log.info('avanço registrado', { ok: r.ok });
    return r;
  });

  ipc.handle('metas:propostas', () => propostas.listar());
  ipc.handle('metas:aplicar-proposta', (_e, id: unknown) => {
    const r = propostas.aplicar(String(id));
    log.info('proposta aplicada', { ok: r.ok });
    return r.ok ? { ok: true, valor: undefined } : r;
  });
  ipc.handle('metas:descartar-proposta', (_e, id: unknown) => {
    propostas.descartar(String(id));
    log.info('proposta descartada');
  });

  store.aoMudar(() => enviar('metas:mudou', completo()));
  let quantas = 0;
  propostas.aoMudar((lista) => {
    enviar('metas:propostas-mudou', lista);
    if (lista.length > quantas) aoChegarProposta();
    quantas = lista.length;
  });
}
