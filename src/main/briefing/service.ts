import {
  BriefingSchema, briefingVazio,
  type AgendaDados, type Briefing, type BriefingSnapshot, type EmailsDados, type FocoDados, type Rede, type SecaoNome,
} from '@shared/briefing';
import type { Logger } from '../log';
import { brutoDaSaida, parseAgenda, parseEmails, parseFoco, type Resultado } from './parser';
import { entradaFoco, promptAgenda, promptEmails, promptFoco } from './prompts';

export type FonteNome = 'agenda' | 'emails' | 'foco';
export type SaidaFonte = { ok: true; bruto: unknown } | { ok: false; erro: string };
export type Gatilho = 'inicio' | 'manual';

export interface Dependencias {
  /** Executa uma fonte no Claude. O prompt já vem pronto. */
  executar: (fonte: FonteNome, prompt: string) => Promise<SaidaFonte>;
  /** 'inicio' espera até ~2 min pela rede; 'manual' checa uma vez. */
  aguardarRede: (modo: Gatilho, aoEsperar: () => void) => Promise<'ok' | 'sem-internet'>;
  agora: () => Date;
  tz: string;
  salvar: (b: Briefing) => void;
  log: Logger;
}

/** Valida o cache do disco; 'carregando' (queda no meio de uma execução) vira ok/vazio conforme haja dados. */
export function briefingDoCache(u: unknown): Briefing {
  const b = BriefingSchema.parse(u);
  for (const nome of ['agenda', 'emails', 'metas', 'foco'] as const) {
    const s = b[nome];
    if (s.status === 'carregando') s.status = s.dados ? 'ok' : 'vazio';
  }
  return b;
}

export class BriefingService {
  private briefing: Briefing;
  private executando = false;
  private rede: Rede = 'ok';
  private ouvintes = new Set<(s: BriefingSnapshot) => void>();

  constructor(private readonly deps: Dependencias, inicial: Briefing = briefingVazio()) {
    this.briefing = inicial;
  }

  snapshot(): BriefingSnapshot {
    return { briefing: structuredClone(this.briefing), executando: this.executando, rede: this.rede };
  }

  aoMudar(cb: (s: BriefingSnapshot) => void): () => void {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  private emitir(): void {
    const s = this.snapshot();
    for (const cb of this.ouvintes) cb(s);
  }

  private persistir(): void {
    try {
      this.deps.salvar(this.briefing);
    } catch (e) {
      this.deps.log.erro('falha ao salvar o briefing', { erro: String(e).slice(0, 100) });
    }
  }

  private marcar(nome: SecaoNome, status: 'carregando'): void {
    this.briefing[nome].status = status;
    delete this.briefing[nome].erro;
  }

  private ok<K extends 'agenda' | 'emails' | 'foco'>(nome: K, dados: NonNullable<Briefing[K]['dados']>): void {
    const s = this.briefing[nome] as { status: string; atualizadoEm?: string; erro?: string; dados?: unknown };
    s.status = 'ok';
    s.atualizadoEm = this.deps.agora().toISOString();
    s.dados = dados;
    delete s.erro;
    this.persistir();
    this.emitir();
  }

  /** Erro numa fonte: guarda a mensagem e MANTÉM os dados antigos (se houver) para o painel continuar útil. */
  private erro(nome: 'agenda' | 'emails' | 'foco', mensagem: string): void {
    const s = this.briefing[nome];
    s.status = 'erro';
    s.erro = mensagem;
    this.persistir();
    this.emitir();
  }

  private async fonte<T>(nome: 'agenda' | 'emails' | 'foco', prompt: string, parse: (b: unknown) => Resultado<T>, aplicar: (d: T) => void): Promise<void> {
    try {
      const saida = await this.deps.executar(nome, prompt);
      if (!saida.ok) return this.erro(nome, saida.erro);
      const r = parse(saida.bruto);
      if (!r.ok) {
        this.deps.log.warn('resposta fora do formato', { fonte: nome });
        return this.erro(nome, r.erro);
      }
      if (r.descartados > 0) this.deps.log.warn('itens descartados no parser', { fonte: nome, descartados: r.descartados });
      aplicar(r.dados);
    } catch (e) {
      this.deps.log.erro('falha inesperada na fonte', { fonte: nome, erro: String(e).slice(0, 100) });
      this.erro(nome, 'Falha inesperada ao executar esta fonte.');
    }
  }

  async atualizar(gatilho: Gatilho): Promise<void> {
    if (this.executando) return;
    this.executando = true;
    this.briefing.gatilho = gatilho;
    this.marcar('agenda', 'carregando');
    this.marcar('emails', 'carregando');
    this.marcar('foco', 'carregando');
    this.emitir();

    try {
      const rede = await this.deps.aguardarRede(gatilho, () => { this.rede = 'aguardando'; this.emitir(); });
      this.rede = rede;
      if (rede === 'sem-internet') {
        for (const n of ['agenda', 'emails', 'foco'] as const) this.erro(n, 'Sem conexão com a internet.');
        return;
      }

      const { agora, tz } = this.deps;
      await Promise.all([
        this.fonte('agenda', promptAgenda(agora(), tz), parseAgenda, (d) => this.ok('agenda', d)),
        this.fonte('emails', promptEmails(agora(), tz), parseEmails, (d) => this.ok('emails', d)),
      ]);

      await this.focar();

      if (this.briefing.agenda.status === 'ok' || this.briefing.emails.status === 'ok') {
        this.briefing.geradoEm = this.deps.agora().toISOString();
      }
    } finally {
      this.executando = false;
      this.persistir();
      this.emitir();
    }
  }

  private async focar(): Promise<void> {
    const agenda = this.briefing.agenda.dados as AgendaDados | undefined;
    const emails = this.briefing.emails.dados as EmailsDados | undefined;
    if (!agenda && !emails) return this.erro('foco', 'Sem dados de agenda ou e-mails para sugerir o foco.');
    const prompt = promptFoco(entradaFoco(agenda, emails, this.deps.agora()));
    await this.fonte<FocoDados>('foco', prompt, parseFoco, (d) => this.ok('foco', d));
  }
}

export { brutoDaSaida };
