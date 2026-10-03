import type { IpcMain } from 'electron';
import type { Retorno } from '@shared/metas';
import type { Postit } from '@shared/postits';
import type { Logger } from '../log';
import type { ConversaService } from './conversa';
import type { Resultado } from './estado';
import type { JanelasPostit } from './janelas';
import type { PostitsStore } from './store';

interface Opcoes {
  ipc: IpcMain;
  store: PostitsStore;
  conversa: ConversaService;
  janelas: JanelasPostit;
  /** Avisa o painel e a bandeja de que a lista mudou. */
  aoMudarLista: () => void;
  log: Logger;
}

const paraRetorno = (r: Resultado): Retorno => (r.ok ? { ok: true, valor: undefined } : { ok: false, erro: r.erro });

/** O que, na janela, depende do estado (se mudar, a janela recebe a visão nova; arrastar a janela não conta). */
const chaveVisual = (p: Postit) => JSON.stringify([p.nome, p.cor, p.instrucoes, p.acessoGoogle, p.sempreNoTopo, p.oculto, p.iniciada]);

export function registrarIpcPostits({ ipc, store, conversa, janelas, aoMudarLista, log }: Opcoes): void {
  const id = (v: unknown) => String(v ?? '');

  ipc.handle('postit:obter', (_e, i: unknown) => conversa.visao(id(i)));
  ipc.handle('postit:enviar', (_e, i: unknown, texto: unknown) => conversa.enviar(id(i), typeof texto === 'string' ? texto : ''));
  ipc.handle('postit:parar', (_e, i: unknown) => conversa.parar(id(i)));
  ipc.handle('postit:renomear', (_e, i: unknown, nome: unknown) => paraRetorno(store.renomear(id(i), String(nome ?? ''))));
  ipc.handle('postit:cor', (_e, i: unknown, cor: unknown) => paraRetorno(store.trocarCor(id(i), String(cor ?? ''))));
  ipc.handle('postit:instrucoes', (_e, i: unknown, t: unknown) => paraRetorno(store.definirInstrucoes(id(i), String(t ?? ''))));
  ipc.handle('postit:topo', (_e, i: unknown, v: unknown) => paraRetorno(store.definirTopo(id(i), v === true)));
  ipc.handle('postit:acesso-google', (_e, i: unknown, v: unknown) => paraRetorno(store.definirAcessoGoogle(id(i), v === true)));
  ipc.handle('postit:ocultar', (_e, i: unknown) => janelas.ocultarPorUsuario(id(i)));
  ipc.handle('postit:excluir', (_e, i: unknown) => { log.info('post-it excluído'); return janelas.excluir(id(i)); });

  ipc.handle('postits:listar', () => janelas.resumos());
  ipc.handle('postits:novo', () => janelas.novo());
  ipc.handle('postits:alternar', (_e, i: unknown) => janelas.alternar(id(i)));

  // Quando o estado muda: sincroniza a janela (título, cor, topo), manda a visão nova só a quem mudou e avisa o painel/bandeja.
  let anterior = new Map(store.snapshot().postits.map((p) => [p.id, chaveVisual(p)]));
  store.aoMudar((estado) => {
    for (const p of estado.postits) {
      const k = chaveVisual(p);
      if (anterior.get(p.id) !== k) {
        janelas.sincronizar(p.id);
        conversa.atualizarJanela(p.id);
      }
    }
    anterior = new Map(estado.postits.map((p) => [p.id, chaveVisual(p)]));
    aoMudarLista();
  });
}
