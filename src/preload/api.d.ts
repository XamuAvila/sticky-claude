import type { EstadoAutoInicio, ResultadoAuto } from '@shared/autoinicio';
import type { BriefingSnapshot } from '@shared/briefing';
import type { Meta, MetaEntrada, MetaEntradaParcial, PropostaMetas, Retorno, SnapshotMetas } from '@shared/metas';
import type { ConteudoPilula } from '@shared/pilula';
import type { EventoPostit, ResumoPostit, VisaoPostit } from '@shared/postits';

export interface StickyApi {
  briefing: {
    obter(): Promise<BriefingSnapshot>;
    atualizar(): Promise<void>;
    /** Devolve a função que cancela a assinatura. */
    aoMudar(cb: (s: BriefingSnapshot) => void): () => void;
  };
  metas: {
    obter(): Promise<SnapshotMetas>;
    criar(entrada: MetaEntrada): Promise<Retorno<Meta>>;
    atualizar(id: string, campos: MetaEntradaParcial): Promise<Retorno<Meta>>;
    excluir(id: string): Promise<Retorno>;
    registrarAvanco(id: string, nota?: string): Promise<Retorno<Meta>>;
    aoMudar(cb: (s: SnapshotMetas) => void): () => void;
    /** Propostas de alteração vindas do Claude, esperando confirmação. */
    propostas(): Promise<PropostaMetas[]>;
    aplicarProposta(id: string): Promise<Retorno>;
    descartarProposta(id: string): Promise<void>;
    aoMudarPropostas(cb: (p: PropostaMetas[]) => void): () => void;
  };
  /** Janela de um post-it (cada janela só recebe os eventos do próprio post-it). */
  postit: {
    obter(id: string): Promise<VisaoPostit | null>;
    /** Resolve quando o Claude termina de responder (ou falha). Os pedaços chegam por aoEvento. */
    enviar(id: string, texto: string): Promise<Retorno>;
    parar(id: string): Promise<void>;
    renomear(id: string, nome: string): Promise<Retorno>;
    cor(id: string, cor: string): Promise<Retorno>;
    instrucoes(id: string, texto: string): Promise<Retorno>;
    topo(id: string, valor: boolean): Promise<Retorno>;
    acessoGoogle(id: string, valor: boolean): Promise<Retorno>;
    /** O X: só oculta (volta pela bandeja). */
    ocultar(id: string): Promise<void>;
    /** Único jeito de apagar um post-it. */
    excluir(id: string): Promise<Retorno>;
    aoEvento(cb: (e: EventoPostit) => void): () => void;
  };
  /** Pílula no topo da tela (próximo evento ou meta do dia). */
  pilula: {
    obter(): Promise<ConteudoPilula | null>;
    aoMudar(cb: (c: ConteudoPilula | null) => void): () => void;
    /** true enquanto o ponteiro está sobre a pílula: a janela passa a capturar o mouse (senão o mouse atravessa). */
    interativa(sobre: boolean): Promise<void>;
    abrirPainel(): Promise<void>;
    /** Preferência (cartão Configurações do painel). */
    estado(): Promise<{ ativa: boolean }>;
    definir(ativa: boolean): Promise<{ ativa: boolean }>;
  };
  /** Inicialização com o Windows (entrada em HKCU\...\Run, só do usuário). */
  autoinicio: {
    estado(): Promise<EstadoAutoInicio>;
    /** Ligar exige `confirmado` (clique no diálogo) na primeira vez. */
    definir(ligar: boolean, confirmado: boolean): Promise<ResultadoAuto>;
  };
  /** Lista de post-its (painel). */
  postits: {
    listar(): Promise<ResumoPostit[]>;
    novo(): Promise<Retorno<string>>;
    alternar(id: string): Promise<void>;
    aoMudar(cb: (l: ResumoPostit[]) => void): () => void;
  };
}

declare global {
  interface Window {
    sticky: StickyApi;
  }
}
