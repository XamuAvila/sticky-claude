import type { AgendaDados } from '@shared/briefing';
import type { Meta } from '@shared/metas';
import { DIAS_PARADA_PADRAO } from '@shared/metas-analise';
import { montarPilula, type ConteudoPilula } from '@shared/pilula';

interface Deps {
  /** Agenda do briefing em cache (a mais recente conhecida). */
  agenda: () => AgendaDados | undefined;
  metas: () => Meta[];
  diasParada?: () => number;
  agora: () => Date;
  aoMudar: (c: ConteudoPilula | null) => void;
}

/**
 * Calcula o que a pílula mostra. Só lê o que já está no computador (briefing em cache e metas): não gasta assinatura.
 * Recalcula quando o briefing ou as metas mudam e a cada 30 s, para "em 12 min" andar sozinho.
 */
export class PilulaService {
  private atual: ConteudoPilula | null | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly d: Deps) {}

  conteudo(): ConteudoPilula | null {
    return this.atual ?? null;
  }

  recalcular(): void {
    const novo = montarPilula(this.d.agenda(), this.d.metas(), this.d.agora(), this.d.diasParada?.() ?? DIAS_PARADA_PADRAO);
    if (this.atual !== undefined && JSON.stringify(novo) === JSON.stringify(this.atual)) return;
    this.atual = novo;
    this.d.aoMudar(novo);
  }

  iniciar(intervaloMs = 30_000): void {
    this.recalcular();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.recalcular(), intervaloMs);
  }

  parar(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
