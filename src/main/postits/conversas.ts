import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { MensagemPostit } from '@shared/postits';
import { gravarJsonAtomico, lerJson } from '../storage';

const MensagemSchema = z.object({
  papel: z.enum(['usuario', 'claude', 'aviso']),
  texto: z.string(),
  em: z.string(),
  parcial: z.boolean().optional(),
});
const ArquivoSchema = z.object({ versao: z.literal(1), mensagens: z.array(MensagemSchema) });

export const MAX_MENSAGENS = 300;
const MAX_CARACTERES_MENSAGEM = 20_000;

/**
 * Cópia LOCAL do texto de cada conversa (uma pasta com um arquivo por post-it).
 * Serve para mostrar a conversa ao reabrir o app. O contexto de verdade fica na sessão do Claude (--resume);
 * se ela se perder, esta cópia permite recomeçar com um resumo.
 */
export class ConversasStore {
  private cache = new Map<string, MensagemPostit[]>();

  constructor(private readonly dir: string) {}

  private arquivo(id: string): string {
    // o id vem do nosso próprio estado (UUID); mesmo assim, nada de separador de caminho
    return join(this.dir, `${id.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
  }

  carregar(id: string): MensagemPostit[] {
    const c = this.cache.get(id);
    if (c) return c.map((m) => ({ ...m }));
    const lido = lerJson(this.arquivo(id), (u) => ArquivoSchema.parse(u))?.mensagens ?? [];
    this.cache.set(id, lido as MensagemPostit[]);
    return lido.map((m) => ({ ...m })) as MensagemPostit[];
  }

  private gravar(id: string, mensagens: MensagemPostit[]): void {
    const aparadas = mensagens.slice(-MAX_MENSAGENS);
    this.cache.set(id, aparadas);
    mkdirSync(this.dir, { recursive: true });
    gravarJsonAtomico(this.arquivo(id), { versao: 1, mensagens: aparadas });
  }

  acrescentar(id: string, m: MensagemPostit): void {
    const texto = m.texto.length > MAX_CARACTERES_MENSAGEM ? `${m.texto.slice(0, MAX_CARACTERES_MENSAGEM)}\n[…texto cortado]` : m.texto;
    this.gravar(id, [...this.carregar(id), { ...m, texto }]);
  }

  /** Apaga a conversa por inteiro: o arquivo e as sobras da gravação atômica (.bak e .tmp). */
  excluir(id: string): void {
    this.cache.delete(id);
    const a = this.arquivo(id);
    for (const f of [a, `${a}.bak`, `${a}.tmp`]) {
      try { if (existsSync(f)) unlinkSync(f); } catch { /* melhor esforço: não impede a exclusão do post-it */ }
    }
  }
}
