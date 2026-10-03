import { existsSync, readFileSync, renameSync } from 'node:fs';
import type { Postit, Retangulo, TelaSalva } from '@shared/postits';
import type { Logger } from '../log';
import { gravarJsonAtomico } from '../storage';
import * as E from './estado';

export interface OpcoesPostits {
  arquivo: string;
  agora: () => Date;
  novoId: () => string;
  log: Logger;
  /** Espera antes de gravar mudanças de posição/tamanho (arrastar gera dezenas de eventos). Padrão 400 ms. */
  atrasoGeometriaMs?: number;
}

/** Post-its em %APPDATA%\StickyClaude\postits.json. Guarda o estado, grava de forma atômica e avisa quem estiver ouvindo. */
export class PostitsStore {
  private estado: E.EstadoPostits = E.estadoVazio();
  private ouvintes = new Set<(e: E.EstadoPostits) => void>();
  private timer: NodeJS.Timeout | undefined;
  private sujo = false;
  /** O arquivo não existia: primeira execução do app (serve para criar o post-it "Metas" só uma vez). */
  readonly primeiraExecucao: boolean;
  aviso: string | undefined;

  constructor(private readonly o: OpcoesPostits) {
    this.primeiraExecucao = !existsSync(o.arquivo);
    this.carregar();
  }

  private ctx(): E.Contexto {
    return { agora: this.o.agora, novoId: this.o.novoId };
  }

  private carregar(): void {
    if (this.primeiraExecucao) return;
    try {
      const txt = readFileSync(this.o.arquivo, 'utf8').replace(/^﻿/, '');
      this.estado = E.EstadoSchema.parse(JSON.parse(txt)) as E.EstadoPostits;
    } catch (e) {
      // Nunca descarta: guarda o arquivo ruim ao lado e recomeça vazio.
      const cop = `${this.o.arquivo}.corrompido-${this.o.agora().toISOString().replace(/[:.]/g, '-')}`;
      try { renameSync(this.o.arquivo, cop); } catch { /* melhor esforço */ }
      this.estado = E.estadoVazio();
      this.aviso = 'O arquivo dos post-its estava ilegível. Guardei uma cópia ao lado e comecei do zero.';
      this.o.log.erro('postits.json ilegível', { motivo: String(e).slice(0, 100) });
    }
  }

  snapshot(): E.EstadoPostits {
    return structuredClone(this.estado);
  }

  obter(id: string): Postit | undefined {
    const p = this.estado.postits.find((x) => x.id === id);
    return p ? structuredClone(p) : undefined;
  }

  aoMudar(cb: (e: E.EstadoPostits) => void): () => void {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  private emitir(): void {
    const s = this.snapshot();
    for (const cb of this.ouvintes) cb(s);
  }

  /** Aplica o resultado de uma transição: grava (na hora, ou com atraso para a geometria) e avisa a tela. */
  private aplicar<R extends E.Resultado<object>>(r: R, imediato = true): R {
    if (r.ok) {
      this.estado = r.estado;
      this.aviso = undefined;
      if (imediato) this.gravarAgora();
      else this.gravarDepois();
      this.emitir();
    }
    return r;
  }

  gravarAgora(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    try {
      gravarJsonAtomico(this.o.arquivo, this.estado);
      this.sujo = false;
    } catch (e) {
      this.o.log.erro('falha ao gravar postits.json', { motivo: String(e).slice(0, 100) });
    }
  }

  private gravarDepois(): void {
    this.sujo = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.gravarAgora(), this.o.atrasoGeometriaMs ?? 400);
  }

  /** Grava o que estiver pendente (chamar ao sair do app). */
  encerrar(): void {
    if (this.sujo) this.gravarAgora();
  }

  criar(n: E.NovoPostit) { return this.aplicar(E.criar(this.estado, n, this.ctx())); }
  renomear(id: string, nome: string) { return this.aplicar(E.renomear(this.estado, id, nome, this.ctx())); }
  trocarCor(id: string, cor: string) { return this.aplicar(E.trocarCor(this.estado, id, cor, this.ctx())); }
  definirInstrucoes(id: string, texto: string) { return this.aplicar(E.definirInstrucoes(this.estado, id, texto, this.ctx())); }
  definirTopo(id: string, v: boolean) { return this.aplicar(E.definirTopo(this.estado, id, v, this.ctx())); }
  definirAcessoGoogle(id: string, v: boolean) { return this.aplicar(E.definirAcessoGoogle(this.estado, id, v, this.ctx())); }
  definirOculto(id: string, v: boolean) { return this.aplicar(E.definirOculto(this.estado, id, v, this.ctx())); }
  marcarIniciada(id: string) { return this.aplicar(E.marcarIniciada(this.estado, id, this.ctx())); }
  novaSessao(id: string) { return this.aplicar(E.novaSessao(this.estado, id, this.o.novoId(), this.ctx())); }
  excluir(id: string) { return this.aplicar(E.excluir(this.estado, id)); }
  atualizarGeometria(id: string, bounds: Retangulo, tela: TelaSalva | undefined) {
    return this.aplicar(E.atualizarGeometria(this.estado, id, bounds, tela, this.ctx()), false);
  }
}
