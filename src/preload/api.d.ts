import type { BriefingSnapshot } from '@shared/briefing';
import type { Meta, MetaEntrada, MetaEntradaParcial, PropostaMetas, Retorno, SnapshotMetas } from '@shared/metas';

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
}

declare global {
  interface Window {
    sticky: StickyApi;
  }
}
