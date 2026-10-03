import type { BriefingSnapshot } from '@shared/briefing';

export interface StickyApi {
  briefing: {
    obter(): Promise<BriefingSnapshot>;
    atualizar(): Promise<void>;
    /** Devolve a função que cancela a assinatura. */
    aoMudar(cb: (s: BriefingSnapshot) => void): () => void;
  };
}

declare global {
  interface Window {
    sticky: StickyApi;
  }
}
