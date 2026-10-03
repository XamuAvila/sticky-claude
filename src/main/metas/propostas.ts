import type { PropostaMetas } from '@shared/metas';
import { descreverOperacoes, extrairPatch, validarPatch, type Operacao } from './patch';
import type { MetasStore } from './store';

interface Pendente extends PropostaMetas {
  operacoes: Operacao[];
}

export type ResultadoPropor =
  | { ok: true; proposta: PropostaMetas }
  /** A resposta não trazia nenhum bloco metas-patch (o normal numa conversa comum). */
  | { ok: 'nenhuma' }
  | { ok: false; erro: string };

const MAX_PENDENTES = 5;

/**
 * Propostas de alteração das metas vindas do Claude, esperando o "Aplicar" do usuário.
 * Ficam só em memória: ao fechar o app, as não confirmadas somem (nada foi alterado).
 */
export class Propostas {
  private pendentes: Pendente[] = [];
  private ouvintes = new Set<(p: PropostaMetas[]) => void>();

  constructor(
    private readonly store: MetasStore,
    private readonly novoId: () => string,
    private readonly agora: () => Date,
  ) {}

  listar(): PropostaMetas[] {
    return this.pendentes.map(({ operacoes: _o, ...dto }) => dto);
  }

  aoMudar(cb: (p: PropostaMetas[]) => void): () => void {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  private emitir(): void {
    const l = this.listar();
    for (const cb of this.ouvintes) cb(l);
  }

  /** Procura um metas-patch na resposta do Claude, valida e deixa pendente. `origem` = nome do post-it. */
  propor(textoDaResposta: string, origem: string): ResultadoPropor {
    const bruto = extrairPatch(textoDaResposta);
    if (bruto === undefined) {
      return /```metas-patch/i.test(textoDaResposta)
        ? { ok: false, erro: 'A proposta de alteração das metas veio com JSON inválido.' }
        : { ok: 'nenhuma' };
    }
    const metas = this.store.snapshot().metas;
    const v = validarPatch(bruto, metas);
    if (!v.ok) return v;
    const descricoes = descreverOperacoes(metas, v.operacoes);
    if (descricoes.length === 0) return { ok: false, erro: 'A proposta não muda nada nas metas.' };

    const p: Pendente = { id: this.novoId(), origem, descricoes, criadaEm: this.agora().toISOString(), operacoes: v.operacoes };
    this.pendentes = [...this.pendentes, p].slice(-MAX_PENDENTES);
    this.emitir();
    const { operacoes: _o, ...dto } = p;
    return { ok: true, proposta: dto };
  }

  aplicar(id: string): { ok: true } | { ok: false; erro: string } {
    const p = this.pendentes.find((x) => x.id === id);
    if (!p) return { ok: false, erro: 'Essa proposta não está mais pendente.' };
    const r = this.store.aplicarProposta(p.operacoes);
    if (r.ok) { this.pendentes = this.pendentes.filter((x) => x.id !== id); this.emitir(); }
    return r;
  }

  descartar(id: string): void {
    const antes = this.pendentes.length;
    this.pendentes = this.pendentes.filter((x) => x.id !== id);
    if (this.pendentes.length !== antes) this.emitir();
  }
}
