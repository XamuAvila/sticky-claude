import type { Meta, Retorno } from '@shared/metas';
import { LIMITE_MENSAGEM, type EventoPostit, type Postit, type VisaoPostit } from '@shared/postits';
import type { ErroClaude } from '../claude/errors';
import type { Logger } from '../log';
import type { Propostas } from '../metas/propostas';
import type { ConversasStore } from './conversas';
import { construirPrompt, prefacioDeContexto } from './prompt';
import type { PostitsStore } from './store';

export interface PedidoConversa {
  postit: Postit;
  /** Texto a enviar (já com o prefácio de contexto, se a sessão foi refeita). */
  texto: string;
  sessionId: string;
  /** true = --resume (a sessão já existe); false = --session-id (primeira vez). */
  retomar: boolean;
  systemPrompt: string;
  aoDelta: (texto: string) => void;
  sinal: AbortSignal;
}

export interface ResultadoConversa {
  ok: boolean;
  texto?: string;
  erro?: ErroClaude;
}

export type ExecutarConversa = (p: PedidoConversa) => Promise<ResultadoConversa>;

export interface DependenciasConversa {
  postits: PostitsStore;
  conversas: ConversasStore;
  propostas: Propostas;
  metas: () => Meta[];
  executar: ExecutarConversa;
  agora: () => Date;
  log: Logger;
  /** Avisa a janela do post-it (estado novo ou pedaço de texto). */
  avisar: (id: string, e: EventoPostit) => void;
}

const MAX_RECUPERACOES = 2;

/**
 * A conversa de cada post-it com o Claude. A sessão é sempre a do post-it (session id guardado no estado),
 * nunca "a última da pasta": --session-id na primeira mensagem, --resume nas seguintes.
 */
export class ConversaService {
  private rodando = new Map<string, AbortController>();

  constructor(private readonly d: DependenciasConversa) {}

  executando(id: string): boolean {
    return this.rodando.has(id);
  }

  visao(id: string): VisaoPostit | null {
    const postit = this.d.postits.obter(id);
    if (!postit) return null;
    return { postit, mensagens: this.d.conversas.carregar(id), executando: this.executando(id) };
  }

  /** Reenvia a visão atual para a janela do post-it (nome, cor, mensagens…). */
  atualizarJanela(id: string): void {
    const v = this.visao(id);
    if (v) this.d.avisar(id, { tipo: 'estado', visao: v });
  }

  parar(id: string): void {
    this.rodando.get(id)?.abort();
  }

  /** Post-it excluído: interrompe o que estiver rodando e apaga a cópia local da conversa. */
  esquecer(id: string): void {
    this.parar(id);
    this.d.conversas.excluir(id);
  }

  private agoraISO(): string {
    return this.d.agora().toISOString();
  }

  private add(id: string, papel: 'usuario' | 'claude' | 'aviso', texto: string, parcial = false): void {
    // Um post-it excluído enquanto a resposta ainda terminava não pode ganhar a conversa de volta no disco.
    if (!this.d.postits.obter(id)) return;
    this.d.conversas.acrescentar(id, { papel, texto, em: this.agoraISO(), ...(parcial ? { parcial: true } : {}) });
  }

  async enviar(id: string, bruto: string): Promise<Retorno> {
    const texto = bruto.trim();
    if (!texto) return { ok: false, erro: 'Escreva uma mensagem.' };
    if (texto.length > LIMITE_MENSAGEM) return { ok: false, erro: `Mensagem longa demais (máximo ${LIMITE_MENSAGEM} caracteres).` };
    if (!this.d.postits.obter(id)) return { ok: false, erro: 'Esse post-it não existe mais.' };
    if (this.rodando.has(id)) return { ok: false, erro: 'O Claude ainda está respondendo.' };

    const ac = new AbortController();
    this.rodando.set(id, ac);
    this.add(id, 'usuario', texto);
    this.atualizarJanela(id);

    let prefacio = '';
    let recuperacoes = 0;
    let parcial = '';
    try {
      for (;;) {
        const p = this.d.postits.obter(id);
        if (!p) return { ok: false, erro: 'Esse post-it foi excluído.' };
        parcial = '';
        const r = await this.d.executar({
          postit: p,
          texto: prefacio + texto,
          sessionId: p.sessionId,
          retomar: p.iniciada,
          systemPrompt: construirPrompt(p, this.d.metas(), this.d.agora()),
          aoDelta: (t) => { parcial += t; this.d.avisar(id, { tipo: 'delta', texto: t }); },
          sinal: ac.signal,
        });

        if (!this.d.postits.obter(id)) return { ok: false, erro: 'Esse post-it foi excluído.' };

        if (r.ok) {
          if (!p.iniciada) this.d.postits.marcarIniciada(id);
          const resposta = (r.texto ?? parcial).trim() || '(sem resposta)';
          this.add(id, 'claude', resposta);
          // Proposta válida: a própria resposta mostra a nota "Propus alterar suas metas" (a tela troca o bloco técnico por ela).
          // Proposta inválida: um aviso explica por que nada foi proposto.
          const prop = this.d.propostas.propor(resposta, p.nome);
          if (prop.ok === false) this.add(id, 'aviso', `Não consegui usar a proposta de alteração das metas: ${prop.erro}`);
          this.d.log.info('post-it respondeu', { retomada: p.iniciada, recuperacoes });
          return { ok: true, valor: undefined };
        }

        const tipo = r.erro?.tipo;
        if (tipo === 'sessao-em-uso' && !p.iniciada && recuperacoes++ < MAX_RECUPERACOES) {
          // a sessão chegou a ser criada numa tentativa anterior que não terminou: passa a retomar
          this.d.postits.marcarIniciada(id);
          continue;
        }
        if (tipo === 'sessao-perdida' && recuperacoes++ < MAX_RECUPERACOES) {
          // O Claude Code não tem mais a sessão (ex.: limpeza de sessões antigas). Nova sessão, mesmo post-it,
          // recomeçando com um resumo da cópia local (sem a mensagem que acabamos de gravar).
          this.d.postits.novaSessao(id);
          const antes = this.d.conversas.carregar(id).slice(0, -1);
          prefacio = prefacioDeContexto(antes);
          this.add(id, 'aviso', 'O histórico dessa conversa não estava mais no Claude. Recomecei a sessão com um resumo da cópia local.');
          this.atualizarJanela(id);
          continue;
        }

        if (parcial.trim()) this.add(id, 'claude', parcial.trim(), true);
        this.add(id, 'aviso', tipo === 'cancelado' ? 'Interrompido.' : (r.erro?.mensagem ?? 'Não consegui falar com o Claude.'));
        this.d.log.warn('post-it falhou', { tipo });
        return { ok: false, erro: r.erro?.mensagem ?? 'Falha ao falar com o Claude.' };
      }
    } finally {
      this.rodando.delete(id);
      this.atualizarJanela(id);
    }
  }
}
