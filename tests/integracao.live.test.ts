// Integração REAL com o seu Claude (consome a assinatura). Só roda com STICKY_LIVE=1:
//   $env:STICKY_LIVE=1; npx vitest run tests/integracao.live.test.ts
// Imprime só contagens e tempos, nunca conteúdo de e-mails ou convites.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LIVE = process.env.STICKY_LIVE === '1';

describe.skipIf(!LIVE)('briefing ao vivo', () => {
  it('Agenda, E-mails e Foco rodam de ponta a ponta', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-live-'));
    process.env.STICKY_DATA_DIR = dir;
    try {
      const { garantirPastas, caminhos } = await import('../src/main/paths');
      const { criarLogger } = await import('../src/main/log');
      const { criarExecutor } = await import('../src/main/briefing/executor');
      const { BriefingService } = await import('../src/main/briefing/service');
      const { aguardarRede, temRede } = await import('../src/main/network');
      garantirPastas();
      const log = criarLogger(caminhos.logs());

      const svc = new BriefingService({
        executar: criarExecutor(log),
        aguardarRede: async () => aguardarRede({ temRede, dormir: (ms) => new Promise((r) => setTimeout(r, ms)), agora: Date.now, limiteMs: 10_000 }),
        agora: () => new Date(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        salvar: () => undefined,
        log,
        // uma meta sintética parada há 9 dias, para ver se o foco a considera
        metas: () => [{
          id: 'live-1', nome: 'Aprender violão', status: 'ativa' as const, porque: 'Tocar com os amigos',
          proximoPasso: 'Praticar 2 acordes', criadaEm: new Date(Date.now() - 20 * 86_400_000).toISOString(), atualizadaEm: '',
          ultimoAvancoEm: new Date(Date.now() - 9 * 86_400_000).toLocaleDateString('sv-SE'),
        }],
      });

      const t0 = Date.now();
      await svc.atualizar('manual');
      const { briefing: b } = svc.snapshot();
      const resumo = {
        ms: Date.now() - t0,
        agenda: { status: b.agenda.status, eventos: b.agenda.dados?.eventos.length, erro: b.agenda.erro },
        emails: { status: b.emails.status, itens: b.emails.dados?.itens.length, suspeitos: b.emails.dados?.suspeitos.length, erro: b.emails.erro },
        foco: {
          status: b.foco.status, prioridades: b.foco.dados?.prioridades.length, erro: b.foco.erro,
          origens: b.foco.dados?.prioridades.map((p) => p.origem),
        },
      };
      console.log('RESUMO AO VIVO', JSON.stringify(resumo));
      console.log('LOG (somente metadados):\n' + readFileSync(join(caminhos.logs(), 'app.log'), 'utf8'));
      expect(b.agenda.status).toBe('ok');
      expect(b.emails.status).toBe('ok');
      expect(b.foco.status).toBe('ok');
      expect(b.foco.dados!.prioridades.length).toBeLessThanOrEqual(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 420_000);
});
