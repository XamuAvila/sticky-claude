// Post-its com o SEU Claude de verdade (consome a assinatura; ~6 chamadas). Só roda com STICKY_LIVE=1:
//   $env:STICKY_LIVE=1; npx vitest run tests/postit.live.test.ts --disable-console-intercept
// Imprime só resultados e tempos. Usa uma pasta de dados temporária (as sessões ficam no cwd temporário).
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LIVE = process.env.STICKY_LIVE === '1';

describe.skipIf(!LIVE)('post-its ao vivo', () => {
  it('mesma sessão depois de "reiniciar", instruções editáveis, streaming e proposta de metas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-plive-'));
    process.env.STICKY_DATA_DIR = dir;
    try {
      const { garantirPastas, caminhos } = await import('../src/main/paths');
      const { criarLogger } = await import('../src/main/log');
      const { MetasStore } = await import('../src/main/metas/store');
      const { Propostas } = await import('../src/main/metas/propostas');
      const { PostitsStore } = await import('../src/main/postits/store');
      const { ConversasStore } = await import('../src/main/postits/conversas');
      const { ConversaService } = await import('../src/main/postits/conversa');
      const { criarExecutorConversa } = await import('../src/main/postits/executor');
      garantirPastas();
      const log = criarLogger(caminhos.logs());
      const agora = () => new Date();

      const metas = new MetasStore({ arquivo: caminhos.metas(), backupsDir: caminhos.backups(), agora, novoId: randomUUID, log });
      const meta = metas.criar({ nome: 'Aprender violão', status: 'ativa', prazo: '2026-12-01', proximoPasso: 'Praticar 2 acordes' });
      const propostas = new Propostas(metas, randomUUID, agora);
      const executar = criarExecutorConversa(log);
      const deltas: string[] = [];

      // "processo do app": monta os serviços a partir dos arquivos em disco (um app novo faz o mesmo ao abrir)
      const montarApp = () => {
        const postits = new PostitsStore({ arquivo: join(dir, 'postits.json'), agora, novoId: randomUUID, log });
        const conversas = new ConversasStore(join(dir, 'conversas'));
        const svc = new ConversaService({
          postits, conversas, propostas, log, agora, metas: () => metas.snapshot().metas, executar,
          avisar: (_id, e) => { if (e.tipo === 'delta') deltas.push(e.texto); },
        });
        return { postits, conversas, svc };
      };

      let app = montarApp();
      const criado = app.postits.criar({ nome: 'Metas', bounds: { x: 0, y: 0, width: 320, height: 380 } });
      if (!criado.ok) throw new Error(criado.erro);
      const id = criado.postit.id;
      const sessao = criado.postit.sessionId;
      const resposta = () => app.conversas.carregar(id).filter((m) => m.papel === 'claude').at(-1)?.texto ?? '';
      const t = async (nome: string, f: () => Promise<unknown>) => { const t0 = Date.now(); await f(); console.log(`  ${nome}: ${((Date.now() - t0) / 1000).toFixed(1)} s`); };

      // 1) primeira mensagem (--session-id) com streaming
      const palavra = 'abacate-' + Math.floor(Math.random() * 9000 + 1000);
      await t('1ª mensagem', async () => {
        const r = await app.svc.enviar(id, `Guarde esta palavra secreta: ${palavra}. Responda somente "guardado".`);
        expect(r).toEqual({ ok: true, valor: undefined });
      });
      expect(app.postits.obter(id)).toMatchObject({ iniciada: true, sessionId: sessao });
      console.log('  deltas de streaming recebidos:', deltas.length, '| resposta:', JSON.stringify(resposta()));
      expect(deltas.length).toBeGreaterThan(0);

      // 2) "reiniciar o app": serviços novos lendo os mesmos arquivos; o processo do claude.exe também é outro
      app = montarApp();
      expect(app.postits.obter(id)).toMatchObject({ iniciada: true, sessionId: sessao });
      await t('2ª mensagem (após reiniciar, --resume)', async () => {
        const r = await app.svc.enviar(id, 'Qual era a palavra secreta que pedi para guardar? Responda somente a palavra.');
        expect(r.ok).toBe(true);
      });
      console.log('  resposta:', JSON.stringify(resposta()), '| esperada:', palavra);
      expect(resposta()).toContain(palavra);
      expect(app.postits.obter(id)!.sessionId).toBe(sessao);

      // 3) instruções editadas depois da sessão criada valem na próxima mensagem (--system-prompt-snapshot off)
      app.postits.definirInstrucoes(id, 'Termine TODA resposta com a palavra CAMBALHOTA, em maiúsculas.');
      await t('3ª mensagem (instruções novas)', async () => {
        expect((await app.svc.enviar(id, 'Diga olá em uma frase curta.')).ok).toBe(true);
      });
      console.log('  resposta:', JSON.stringify(resposta()));
      expect(resposta()).toContain('CAMBALHOTA');

      // 4) o modelo real propõe alterações de metas no formato certo (e nada é aplicado sozinho)
      await t('4ª mensagem (proposta de metas)', async () => {
        expect((await app.svc.enviar(id, 'Adie o prazo da meta "Aprender violão" em 7 dias e me proponha essa alteração.')).ok).toBe(true);
      });
      const pend = propostas.listar();
      console.log('  propostas pendentes:', pend.length, '| mudanças:', JSON.stringify(pend[0]?.descricoes));
      expect(pend).toHaveLength(1);
      expect(metas.snapshot().metas.find((m) => m.id === meta.id)!.prazo).toBe('2026-12-01'); // intacto até o "Aplicar"
      expect(app.conversas.carregar(id).some((m) => m.papel === 'aviso')).toBe(false);

      // 5) a conversa toda está na cópia local, na ordem
      const papeis = app.conversas.carregar(id).map((m) => m.papel).join(',');
      expect(papeis).toBe('usuario,claude,usuario,claude,usuario,claude,usuario,claude');

      // 6) só metadados no log do app: nenhum texto da conversa
      const logTxt = readFileSync(join(caminhos.logs(), 'app.log'), 'utf8');
      expect(logTxt).not.toContain(palavra);
      expect(logTxt).not.toContain('CAMBALHOTA');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);
});
