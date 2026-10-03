import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, watch } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { ZodError } from 'zod';
import { MetaEntradaParcialSchema, MetaEntradaSchema, MetasArquivoSchema, type Meta, type Retorno, type SnapshotMetas } from '@shared/metas';
import type { Logger } from '../log';
import { gravarJsonAtomico } from '../storage';
import { aplicarOperacoes, validarPatch, type ContextoAplicar, type Operacao } from './patch';

export interface OpcoesStore {
  arquivo: string;
  backupsDir: string;
  agora: () => Date;
  novoId: () => string;
  log: Logger;
  /** Quantos backups manter (padrão 10). */
  manterBackups?: number;
}

export class MetaNaoEncontrada extends Error {
  constructor() {
    super('Essa meta não existe mais.');
  }
}

/** Mensagem em português para mostrar na tela (nunca vaza stack nem texto técnico longo). */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof MetaNaoEncontrada) return e.message;
  if (e instanceof ZodError) {
    const i = e.issues[0];
    const campo = i?.path[0];
    const rotulos: Record<string, string> = { nome: 'Nome', status: 'Status', prazo: 'Prazo', porque: 'Por quê', proximoPasso: 'Próximo passo' };
    const msg = i?.message && !/^(Invalid|Too |Required|Expected)/i.test(i.message) ? i.message : 'valor inválido';
    return typeof campo === 'string' ? `${rotulos[campo] ?? campo}: ${msg}` : msg;
  }
  return 'Não consegui salvar. Tente de novo.';
}

/** Executa uma ação e devolve ok/erro em vez de lançar (usado pelas ações vindas da tela). */
export function tratar<T>(fn: () => T): Retorno<T> {
  try {
    return { ok: true, valor: fn() };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e) };
  }
}

/** Metas locais em %APPDATA%\StickyClaude\metas.json: leitura tolerante, escrita atômica, backup antes de ações arriscadas. */
export class MetasStore {
  private metas: Meta[] = [];
  private aviso: string | undefined;
  private ouvintes = new Set<(s: SnapshotMetas) => void>();
  private ultimaSerie = '';

  constructor(private readonly o: OpcoesStore) {
    this.carregar();
  }

  snapshot(): SnapshotMetas {
    return { metas: structuredClone(this.metas), ...(this.aviso ? { aviso: this.aviso } : {}) };
  }

  aoMudar(cb: (s: SnapshotMetas) => void): () => void {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  private emitir(): void {
    const s = this.snapshot();
    for (const cb of this.ouvintes) cb(s);
  }

  private carregar(): void {
    const { arquivo, log } = this.o;
    if (!existsSync(arquivo)) {
      this.metas = [];
      this.ultimaSerie = JSON.stringify(this.metas);
      return;
    }
    try {
      const txt = readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
      this.metas = MetasArquivoSchema.parse(JSON.parse(txt)).metas;
      this.aviso = undefined;
    } catch (e) {
      // Nunca descarta o que o usuário tinha: guarda o arquivo ruim ao lado e recomeça vazio.
      const cop = `${arquivo}.corrompido-${this.o.agora().toISOString().replace(/[:.]/g, '-')}`;
      try { renameSync(arquivo, cop); } catch { /* melhor esforço */ }
      this.metas = [];
      this.aviso = `O arquivo de metas estava ilegível. Guardei uma cópia como "${basename(cop)}" e comecei uma lista vazia.`;
      log.erro('metas.json ilegível', { motivo: String(e).slice(0, 100) });
    }
    this.ultimaSerie = JSON.stringify(this.metas);
  }

  /** Relê o arquivo (edição externa). Só avisa a tela se algo mudou de verdade. */
  recarregar(): void {
    const antes = this.ultimaSerie;
    this.carregar();
    if (JSON.stringify(this.metas) !== antes || this.aviso) this.emitir();
  }

  /** Observa o arquivo (edição manual ou por outro programa). Devolve a função que para a observação. */
  observar(): () => void {
    const dir = dirname(this.o.arquivo);
    mkdirSync(dir, { recursive: true });
    const nome = basename(this.o.arquivo);
    let timer: NodeJS.Timeout | undefined;
    const w = watch(dir, (_ev, arq) => {
      if (arq !== nome) return;
      clearTimeout(timer);
      timer = setTimeout(() => this.recarregar(), 300);
    });
    return () => { clearTimeout(timer); w.close(); };
  }

  private gravar(novas: Meta[]): void {
    gravarJsonAtomico(this.o.arquivo, { versao: 1, metas: novas });
    this.metas = novas;
    this.ultimaSerie = JSON.stringify(novas);
    this.aviso = undefined;
    this.emitir();
  }

  /** Cópia datada do arquivo atual (antes de excluir ou aplicar uma proposta do Claude). */
  private fazerBackup(motivo: string): void {
    const { arquivo, backupsDir } = this.o;
    if (!existsSync(arquivo)) return;
    try {
      mkdirSync(backupsDir, { recursive: true });
      const carimbo = this.o.agora().toISOString().replace(/[:.]/g, '-');
      copyFileSync(arquivo, join(backupsDir, `metas-${carimbo}-${motivo}.json`));
      const todos = readdirSync(backupsDir).filter((f) => f.startsWith('metas-')).sort();
      for (const velho of todos.slice(0, Math.max(0, todos.length - (this.o.manterBackups ?? 10)))) unlinkSync(join(backupsDir, velho));
    } catch (e) {
      this.o.log.warn('backup das metas falhou', { motivo: String(e).slice(0, 100) });
    }
  }

  private existe(id: string): boolean {
    return this.metas.some((m) => m.id === id);
  }

  private ctx(): ContextoAplicar {
    return { agora: this.o.agora(), novoId: this.o.novoId };
  }

  criar(entrada: unknown): Meta {
    const e = MetaEntradaSchema.parse(entrada);
    const antes = this.metas.length;
    this.gravar(aplicarOperacoes(this.metas, [{ op: 'criar', meta: e }], this.ctx()));
    return this.metas[antes]!;
  }

  atualizar(id: string, campos: unknown): Meta {
    if (!this.existe(id)) throw new MetaNaoEncontrada();
    const c = MetaEntradaParcialSchema.parse(campos);
    this.gravar(aplicarOperacoes(this.metas, [{ op: 'atualizar', id, campos: c }], this.ctx()));
    return this.metas.find((m) => m.id === id)!;
  }

  registrarAvanco(id: string, nota?: string): Meta {
    if (!this.existe(id)) throw new MetaNaoEncontrada();
    const n = nota?.trim() ? nota.trim().slice(0, 300) : undefined;
    this.gravar(aplicarOperacoes(this.metas, [{ op: 'avanco', id, ...(n ? { nota: n } : {}) }], this.ctx()));
    return this.metas.find((m) => m.id === id)!;
  }

  excluir(id: string): void {
    if (!this.existe(id)) throw new MetaNaoEncontrada();
    this.fazerBackup('antes-de-excluir');
    this.gravar(this.metas.filter((m) => m.id !== id));
  }

  /** Aplica uma proposta já confirmada pelo usuário: revalida contra o estado atual, faz backup e grava tudo ou nada. */
  aplicarProposta(ops: readonly Operacao[]): { ok: true } | { ok: false; erro: string } {
    const v = validarPatch({ operacoes: ops }, this.metas);
    if (!v.ok) return v;
    this.fazerBackup('antes-da-proposta');
    this.gravar(aplicarOperacoes(this.metas, v.operacoes, this.ctx()));
    return { ok: true };
  }
}
