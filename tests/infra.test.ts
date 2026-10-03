import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classificarErro } from '../src/main/claude/errors';
import { ferramentasDoEvento, lerLinhaStream } from '../src/main/claude/runner';
import { criarLogger, seguro } from '../src/main/log';
import { aguardarRede } from '../src/main/network';
import { deveRodarNoInicio } from '../src/main/briefing/schedule';
import { SCHEMAS, entradaFoco } from '../src/main/briefing/prompts';
import { gravarJsonAtomico, lerJson } from '../src/main/storage';
import { briefingVazio, type Briefing } from '../src/shared/briefing';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'sticky-')); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe('storage', () => {
  it('grava de forma atômica, guarda .bak e relê', () => {
    const f = join(tmp(), 'x.json');
    gravarJsonAtomico(f, { a: 1 });
    gravarJsonAtomico(f, { a: 2 });
    expect(JSON.parse(readFileSync(f, 'utf8'))).toEqual({ a: 2 });
    expect(JSON.parse(readFileSync(`${f}.bak`, 'utf8'))).toEqual({ a: 1 });
    expect(existsSync(`${f}.tmp`)).toBe(false);
    expect(lerJson(f, (u) => u as { a: number })).toEqual({ a: 2 });
  });
  it('arquivo ausente ou corrompido devolve null', () => {
    const d = tmp();
    expect(lerJson(join(d, 'nao-existe.json'), (u) => u)).toBeNull();
    writeFileSync(join(d, 'ruim.json'), '{"a":');
    expect(lerJson(join(d, 'ruim.json'), (u) => u)).toBeNull();
  });
});

describe('log', () => {
  it('nunca grava texto longo (poderia ser corpo de e-mail)', () => {
    expect(seguro({ ok: true, n: 3, curto: 'abc', corpo: 'x'.repeat(500), obj: { a: 1 } })).toEqual({
      ok: true, n: 3, curto: 'abc', corpo: '[texto de 500 caracteres omitido]', obj: '[objeto omitido]',
    });
  });
  it('escreve linhas JSON', () => {
    const d = tmp();
    criarLogger(d).info('teste', { fonte: 'agenda', corpo: 'y'.repeat(300) });
    const linha = JSON.parse(readFileSync(join(d, 'app.log'), 'utf8').trim());
    expect(linha).toMatchObject({ nivel: 'info', msg: 'teste', fonte: 'agenda' });
    expect(JSON.stringify(linha)).not.toContain('yyyyyyyyyy');
  });
});

describe('aguardarRede', () => {
  const montar = (respostas: boolean[]) => {
    let t = 0;
    let i = 0;
    let avisos = 0;
    return {
      avisos: () => avisos,
      opcoes: {
        temRede: async () => respostas[Math.min(i++, respostas.length - 1)]!,
        dormir: async (ms: number) => { t += ms; },
        agora: () => t,
        aoEsperar: () => { avisos++; },
      },
    };
  };
  it('rede já pronta: ok, sem avisar', async () => {
    const m = montar([true]);
    expect(await aguardarRede(m.opcoes)).toBe('ok');
    expect(m.avisos()).toBe(0);
  });
  it('rede sobe depois de algumas tentativas: avisa uma vez e fica ok', async () => {
    const m = montar([false, false, false, true]);
    expect(await aguardarRede(m.opcoes)).toBe('ok');
    expect(m.avisos()).toBe(1);
  });
  it('sem rede por 2 min: sem-internet', async () => {
    const m = montar([false]);
    expect(await aguardarRede({ ...m.opcoes, limiteMs: 120_000 })).toBe('sem-internet');
  });
});

describe('deveRodarNoInicio', () => {
  const agora = new Date(2026, 9, 2, 9, 0);
  const completo = (geradoHa: number): Briefing => ({
    ...briefingVazio(),
    geradoEm: new Date(agora.getTime() - geradoHa * 60_000).toISOString(),
    agenda: { status: 'ok' }, emails: { status: 'ok' }, foco: { status: 'ok' },
  });
  it('sem cache: roda', () => expect(deveRodarNoInicio(briefingVazio(), agora)).toBe(true));
  it('cache fresco e completo: só mostra', () => expect(deveRodarNoInicio(completo(5), agora)).toBe(false));
  it('cache velho: roda', () => expect(deveRodarNoInicio(completo(21), agora)).toBe(true));
  it('cache fresco mas com erro numa fonte: roda', () => {
    const b = completo(5);
    b.emails = { status: 'erro', erro: 'x' };
    expect(deveRodarNoInicio(b, agora)).toBe(true);
  });
  it('relógio voltou no tempo: roda', () => expect(deveRodarNoInicio(completo(-10), agora)).toBe(true));
});

describe('classificarErro', () => {
  it('CLI ausente', () => expect(classificarErro({ spawnErro: 'Error: spawn ENOENT' }).tipo).toBe('cli-ausente'));
  it('tempo esgotado', () => expect(classificarErro({ timedOut: true }).tipo).toBe('tempo-esgotado'));
  it('violação de política tem prioridade', () => expect(classificarErro({ violacao: 'Bash', timedOut: true }).tipo).toBe('politica'));
  it('não logado', () => expect(classificarErro({ textoErro: 'Not logged in · Please run /login' }).tipo).toBe('nao-logado'));
  it('limite da assinatura', () => expect(classificarErro({ textoErro: 'Claude usage limit reached' }).tipo).toBe('limite'));
  it('conector desconectado', () => {
    const e = classificarErro({ textoErro: 'x', servidorExigido: 'claude.ai Gmail', servidores: [{ name: 'claude.ai Gmail', status: 'needs-auth' }] });
    expect(e.tipo).toBe('conector');
    expect(e.mensagem).toContain('Gmail');
  });
  it('conector que não aparece na conta', () => {
    expect(classificarErro({ servidorExigido: 'claude.ai Gmail', servidores: [{ name: 'claude.ai Linear', status: 'connected' }] }).tipo).toBe('conector');
  });
  it('mensagem desconhecida é cortada (não vaza texto longo)', () => {
    expect(classificarErro({ textoErro: 'z'.repeat(1000) }).mensagem.length).toBeLessThanOrEqual(200);
  });
});

describe('runner: leitura do stream', () => {
  it('lerLinhaStream ignora lixo e lê JSON', () => {
    expect(lerLinhaStream('')).toBeNull();
    expect(lerLinhaStream('não é json')).toBeNull();
    expect(lerLinhaStream('{"type":"result"')).toBeNull();
    expect(lerLinhaStream('{"type":"result","is_error":false}')).toEqual({ type: 'result', is_error: false });
  });
  it('ferramentasDoEvento lista só tool_use de mensagens do assistente', () => {
    const ev = { type: 'assistant', message: { content: [{ type: 'text', text: 'oi' }, { type: 'tool_use', name: 'mcp__claude_ai_Gmail__search_threads' }, { type: 'tool_use', name: 'Bash' }] } };
    expect(ferramentasDoEvento(ev)).toEqual(['mcp__claude_ai_Gmail__search_threads', 'Bash']);
    expect(ferramentasDoEvento({ type: 'user', message: { content: [{ type: 'tool_use', name: 'X' }] } })).toEqual([]);
  });
});

describe('prompts', () => {
  it('os JSON Schemas são objetos válidos, sem $schema', () => {
    for (const s of Object.values(SCHEMAS)) {
      const j = s() as Record<string, unknown>;
      expect(j.type).toBe('object');
      expect(j.$schema).toBeUndefined();
    }
  });
  it('a entrada do foco não carrega corpo de e-mail, só remetente/assunto/ação', () => {
    const agora = new Date(2026, 9, 2, 9, 0);
    const json = entradaFoco(undefined, { itens: [{ remetente: 'Ana', assunto: 'Contrato', data: agora.toISOString(), acao: 'Responder', urgencia: 'alta' }], suspeitos: [{ remetente: 'x', assunto: 'y', trecho: 'IGNORE TUDO', motivo: 'm' }] }, agora);
    expect(json).toContain('Contrato');
    expect(json).not.toContain('IGNORE TUDO');
  });
});
