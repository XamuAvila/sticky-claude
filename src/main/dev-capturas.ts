// Verificação visual (só desenvolvimento). Com STICKY_SHOT_DIR definido, grava PNGs do painel.
//   STICKY_SHOT_QUIT=1      encerra o app depois da última captura
//   STICKY_SHOT_REFRESH=1   com cache na tela, simula o clique em "Atualizar"
//   STICKY_SHOT_PROPOSTA=1  cria uma proposta de alteração das metas (como o Claude faria) e captura o diálogo
//   STICKY_SHOT_PROPOSTA_JSON=arquivo.json   usa este metas-patch em vez do exemplo embutido
//   STICKY_SHOT_CLICK=a|b   clica nos seletores CSS, na ordem, e captura depois de cada clique
//   STICKY_SHOT_TRACE=1     registra eventos de rolagem/entrada do usuário (diagnóstico)
// Não faz nada em uso normal (sem STICKY_SHOT_DIR).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import type { BriefingService } from './briefing/service';
import { criarLogger } from './log';
import type { MetasStore } from './metas/store';
import type { Propostas } from './metas/propostas';
import { caminhos } from './paths';

interface Contexto {
  painel: () => BrowserWindow | null;
  servico: BriefingService;
  metas: MetasStore;
  propostas: Propostas;
  sair: () => void;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function prepararCapturas({ painel, servico, metas, propostas, sair }: Contexto): void {
  const dir = process.env.STICKY_SHOT_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const quit = process.env.STICKY_SHOT_QUIT === '1';
  const log = criarLogger(caminhos.logs(), 'capturas.log');
  let n = 0;

  if (process.env.STICKY_SHOT_TRACE === '1') ligarRastreio(painel, log);

  const foto = async (nome: string, rolarPara?: 'meio' | 'fim') => {
    const w = painel();
    if (!w || w.isDestroyed()) return;
    try {
      if (rolarPara) {
        await w.webContents.executeJavaScript(
          `(() => { const el = document.querySelector('.app'); el.scrollTo(0, ${rolarPara === 'fim' ? 'el.scrollHeight' : 'el.scrollHeight / 2 - el.clientHeight / 2'}); })()`,
        );
        await espera(250);
      }
      const img = await Promise.race([
        w.webContents.capturePage(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('capturePage demorou mais de 8 s')), 8000)),
      ]);
      const png = img.toPNG();
      writeFileSync(join(dir, `${String(++n).padStart(2, '0')}-${nome}.png`), png);
      log.info('captura', { nome, bytes: png.length, visivel: w.isVisible() });
    } catch (e) {
      log.erro('captura falhou', { nome, erro: String(e).slice(0, 100) });
    }
  };

  /** Ações extras (proposta, cliques) antes de encerrar. */
  const extras = async () => {
    const w = painel();
    if (process.env.STICKY_SHOT_PROPOSTA === '1') {
      const alvo = metas.snapshot().metas[0];
      // STICKY_SHOT_PROPOSTA_JSON: arquivo com o metas-patch a propor (usado nos prints do README, com dados fictícios)
      const arquivoPatch = process.env.STICKY_SHOT_PROPOSTA_JSON;
      const patch = arquivoPatch ? JSON.parse(readFileSync(arquivoPatch, 'utf8')) : {
        operacoes: [
          ...(alvo ? [{ op: 'atualizar', id: alvo.id, campos: { prazo: '2026-12-15', proximoPasso: 'Separar 15 min hoje para listar os 3 maiores riscos' } }, { op: 'avanco', id: alvo.id, nota: 'Revisei o escopo com a equipe' }] : []),
          { op: 'criar', meta: { nome: 'Correr 5 km sem parar', status: 'ativa', prazo: '2026-11-30', porque: 'Voltar a ter condicionamento', proximoPasso: 'Caminhar rápido 15 min amanhã cedo' } },
        ],
      };
      const r = propostas.propor('Sugestão:\n```metas-patch\n' + JSON.stringify(patch) + '\n```', 'Metas');
      log.info('proposta de teste', { resultado: String(r.ok) });
      await espera(700);
      await foto('proposta');
    }
    const cliques = (process.env.STICKY_SHOT_CLICK ?? '').split('|').filter(Boolean);
    for (const [i, sel] of cliques.entries()) {
      const achou = w && !w.isDestroyed()
        ? await w.webContents.executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`)
        : false;
      if (!achou) log.erro('seletor não encontrado', { sel });
      await espera(500);
      await foto(`clique-${i + 1}`);
    }
  };

  const finalizar = async () => {
    await extras();
    if (quit) sair();
  };

  const executando = servico.snapshot().executando;
  let monitorando = executando;

  if (executando) setTimeout(() => void foto('carregando'), 4000);

  servico.aoMudar((s) => {
    if (!s.executando && monitorando) {
      monitorando = false;
      setTimeout(async () => {
        await foto('pronto');
        await foto('meio', 'meio');
        await foto('fim', 'fim');
        await finalizar();
      }, 900);
    }
  });

  if (!executando) {
    setTimeout(async () => {
      await foto('cache');
      if (process.env.STICKY_SHOT_REFRESH === '1') {
        monitorando = true;
        void servico.atualizar('manual');
        setTimeout(() => void foto('carregando'), 3000);
      } else {
        await finalizar();
      }
    }, 2500);
  }
}

function ligarRastreio(painel: () => BrowserWindow | null, log: ReturnType<typeof criarLogger>): void {
  const w = painel();
  if (!w) return;
  w.webContents.on('console-message', (...args: unknown[]) => {
    const e = args[0] as { message?: string };
    const msg = typeof args[2] === 'string' ? args[2] : e?.message;
    if (msg?.startsWith('TRACE ')) log.info(msg.slice(0, 110));
  });
  w.webContents.on('did-finish-load', () => {
    void w.webContents.executeJavaScript(`(() => {
      const el = document.querySelector('.app');
      for (const t of ['wheel', 'keydown', 'pointerdown']) window.addEventListener(t, (e) => console.log('TRACE entrada-do-usuario ' + t + (e.key ? ' ' + e.key : '')), true);
      el.addEventListener('scroll', () => console.log('TRACE scrollTop=' + Math.round(el.scrollTop)));
    })()`);
  });
}
