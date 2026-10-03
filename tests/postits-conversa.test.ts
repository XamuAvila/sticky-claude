import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErroClaude } from '../src/main/claude/errors';
import { textoDoDelta } from '../src/main/postits/executor';
import { MetasStore } from '../src/main/metas/store';
import { Propostas } from '../src/main/metas/propostas';
import { ConversaService, type PedidoConversa, type ResultadoConversa } from '../src/main/postits/conversa';
import { ConversasStore } from '../src/main/postits/conversas';
import { construirPrompt, prefacioDeContexto } from '../src/main/postits/prompt';
import { PostitsStore } from '../src/main/postits/store';
import type { EventoPostit } from '../src/shared/postits';

const AGORA = new Date(2026, 9, 2, 12, 0);
const pastas: string[] = [];
afterEach(() => { while (pastas.length) rmSync(pastas.pop()!, { recursive: true, force: true }); });

type Roteiro = ResultadoConversa | ((p: PedidoConversa) => ResultadoConversa | Promise<ResultadoConversa>);

function montar(roteiro: Roteiro[]) {
  const dir = mkdtempSync(join(tmpdir(), 'sticky-conv-'));
  pastas.push(dir);
  const log = { info: vi.fn(), warn: vi.fn(), erro: vi.fn() };
  const agora = () => AGORA;
  const postits = new PostitsStore({ arquivo: join(dir, 'postits.json'), agora, novoId: randomUUID, log });
  const conversas = new ConversasStore(join(dir, 'conversas'));
  const metas = new MetasStore({ arquivo: join(dir, 'metas.json'), backupsDir: join(dir, 'backups'), agora, novoId: randomUUID, log });
  const meta = metas.criar({ nome: 'Inglês', status: 'ativa', prazo: '2026-12-01', proximoPasso: 'Revisar' });
  const propostas = new Propostas(metas, randomUUID, agora);
  const eventos: Array<{ id: string; e: EventoPostit }> = [];
  const chamadas: PedidoConversa[] = [];
  const fila = [...roteiro];
  const svc = new ConversaService({
    postits, conversas, propostas, metas: () => metas.snapshot().metas, agora, log,
    avisar: (id, e) => eventos.push({ id, e }),
    executar: async (p) => {
      chamadas.push(p);
      const r = fila.shift();
      if (!r) throw new Error('roteiro acabou');
      return typeof r === 'function' ? r(p) : r;
    },
  });
  const criado = postits.criar({ nome: 'Metas', bounds: { x: 0, y: 0, width: 320, height: 380 } });
  if (!criado.ok) throw new Error(criado.erro);
  return { dir, svc, postits, conversas, propostas, metas, meta, eventos, chamadas, id: criado.postit.id, sessionId: criado.postit.sessionId };
}

const ok = (texto: string): ResultadoConversa => ({ ok: true, texto });
const falha = (tipo: ErroClaude['tipo'], mensagem = 'erro'): ResultadoConversa => ({ ok: false, erro: { tipo, mensagem } });

describe('sessão do post-it: primeira vez e retomada', () => {
  it('1ª mensagem usa --session-id (retomar=false); depois passa a retomar a MESMA sessão', async () => {
    const t = montar([ok('oi!'), ok('de novo!')]);
    expect(await t.svc.enviar(t.id, 'olá')).toEqual({ ok: true, valor: undefined });
    expect(t.postits.obter(t.id)!.iniciada).toBe(true);
    await t.svc.enviar(t.id, 'e agora?');
    expect(t.chamadas.map((c) => [c.sessionId, c.retomar])).toEqual([[t.sessionId, false], [t.sessionId, true]]);
  });

  it('a sessão é a do post-it, não "a última da pasta": post-its diferentes, sessões diferentes', async () => {
    const t = montar([ok('a'), ok('b')]);
    const outro = t.postits.criar({ nome: 'Projeto X', bounds: { x: 0, y: 0, width: 320, height: 380 } });
    if (!outro.ok) throw new Error();
    await t.svc.enviar(t.id, 'um');
    await t.svc.enviar(outro.postit.id, 'dois');
    expect(t.chamadas[0]!.sessionId).not.toBe(t.chamadas[1]!.sessionId);
    expect(t.chamadas[1]!.retomar).toBe(false); // o outro post-it ainda não tinha sessão
  });

  it('depois de "reiniciar" (store novo lendo o mesmo arquivo), continua retomando a mesma sessão', async () => {
    const t = montar([ok('oi')]);
    await t.svc.enviar(t.id, 'primeira');
    const log = { info: vi.fn(), warn: vi.fn(), erro: vi.fn() };
    const relido = new PostitsStore({ arquivo: join(t.dir, 'postits.json'), agora: () => AGORA, novoId: randomUUID, log });
    const p = relido.obter(t.id)!;
    expect([p.sessionId, p.iniciada]).toEqual([t.sessionId, true]);
    const conv = new ConversasStore(join(t.dir, 'conversas')).carregar(t.id);
    expect(conv.map((m) => m.papel)).toEqual(['usuario', 'claude']);
  });

  it('falha na 1ª mensagem: continua não iniciada e tenta de novo com --session-id', async () => {
    const t = montar([falha('falha', 'sem rede'), ok('agora foi')]);
    expect((await t.svc.enviar(t.id, 'a')).ok).toBe(false);
    expect(t.postits.obter(t.id)!.iniciada).toBe(false);
    await t.svc.enviar(t.id, 'b');
    expect(t.chamadas.map((c) => c.retomar)).toEqual([false, false]);
    expect(t.postits.obter(t.id)!.iniciada).toBe(true);
  });
});

describe('recuperação de sessão', () => {
  it('"já existe" (a 1ª tentativa chegou a criar a sessão): marca como iniciada e retoma sozinho', async () => {
    const t = montar([falha('sessao-em-uso'), ok('ok')]);
    expect((await t.svc.enviar(t.id, 'oi')).ok).toBe(true);
    expect(t.chamadas.map((c) => [c.sessionId, c.retomar])).toEqual([[t.sessionId, false], [t.sessionId, true]]);
  });

  it('sessão sumiu do Claude: troca o session id e recomeça com resumo da cópia local, avisando', async () => {
    const t = montar([ok('resposta 1'), falha('sessao-perdida'), ok('resposta 2')]);
    await t.svc.enviar(t.id, 'minha palavra secreta é abacate');
    const r = await t.svc.enviar(t.id, 'qual era a palavra?');
    expect(r.ok).toBe(true);

    const [, perdida, refeita] = t.chamadas;
    expect(perdida!.retomar).toBe(true);
    expect(refeita!.sessionId).not.toBe(t.sessionId);
    expect(refeita!.retomar).toBe(false);
    // o resumo leva a conversa anterior, mas NÃO repete a pergunta atual como contexto
    expect(refeita!.texto).toContain('abacate');
    expect(refeita!.texto).toContain('resposta 1');
    expect(refeita!.texto.split('Mensagem atual do usuário:\n')[1]).toBe('qual era a palavra?');
    expect(t.postits.obter(t.id)).toMatchObject({ sessionId: refeita!.sessionId, iniciada: true });
    expect(t.conversas.carregar(t.id).some((m) => m.papel === 'aviso' && /não estava mais no Claude/.test(m.texto))).toBe(true);
  });

  it('não entra em loop: no máximo 2 recuperações', async () => {
    const t = montar([falha('sessao-perdida'), falha('sessao-perdida'), falha('sessao-perdida')]);
    const r = await t.svc.enviar(t.id, 'oi');
    expect(r.ok).toBe(false);
    expect(t.chamadas).toHaveLength(3);
  });
});

describe('mensagens, erros e "Parar"', () => {
  it('grava a conversa (usuário e Claude) e manda os pedaços de texto para a janela', async () => {
    const t = montar([(p) => { p.aoDelta('Olá, '); p.aoDelta('mundo'); return ok('Olá, mundo'); }]);
    await t.svc.enviar(t.id, 'oi');
    expect(t.conversas.carregar(t.id).map((m) => [m.papel, m.texto])).toEqual([['usuario', 'oi'], ['claude', 'Olá, mundo']]);
    expect(t.eventos.filter((x) => x.e.tipo === 'delta').map((x) => (x.e as { texto: string }).texto)).toEqual(['Olá, ', 'mundo']);
    const ultimo = t.eventos.at(-1)!.e;
    expect(ultimo.tipo === 'estado' && ultimo.visao.executando).toBe(false);
  });

  it('erro vira um aviso na conversa (sem apagar a pergunta)', async () => {
    const t = montar([falha('limite', 'Limite de uso da assinatura atingido.')]);
    const r = await t.svc.enviar(t.id, 'oi');
    expect(r).toEqual({ ok: false, erro: 'Limite de uso da assinatura atingido.' });
    expect(t.conversas.carregar(t.id).map((m) => m.papel)).toEqual(['usuario', 'aviso']);
  });

  it('"Parar" guarda o que já chegou como resposta parcial e avisa "Interrompido."', async () => {
    let parar!: () => void;
    const t = montar([async (p) => {
      p.aoDelta('Começando a resp');
      await new Promise<void>((res) => { parar = res; p.sinal.addEventListener('abort', () => res()); });
      return falha('cancelado', 'Interrompido.');
    }]);
    const envio = t.svc.enviar(t.id, 'conte uma história longa');
    await vi.waitFor(() => expect(t.svc.executando(t.id)).toBe(true));
    t.svc.parar(t.id);
    await envio;
    void parar;
    const msgs = t.conversas.carregar(t.id);
    expect(msgs.map((m) => [m.papel, m.parcial ?? false])).toEqual([['usuario', false], ['claude', true], ['aviso', false]]);
    expect(msgs[1]!.texto).toBe('Começando a resp');
    expect(msgs[2]!.texto).toBe('Interrompido.');
    expect(t.svc.executando(t.id)).toBe(false);
  });

  it('não aceita duas mensagens ao mesmo tempo no mesmo post-it', async () => {
    let liberar!: () => void;
    const t = montar([() => new Promise<ResultadoConversa>((res) => { liberar = () => res(ok('fim')); })]);
    const a = t.svc.enviar(t.id, 'primeira');
    await vi.waitFor(() => expect(t.svc.executando(t.id)).toBe(true));
    expect(await t.svc.enviar(t.id, 'segunda')).toEqual({ ok: false, erro: 'O Claude ainda está respondendo.' });
    liberar();
    await a;
    expect(t.chamadas).toHaveLength(1);
  });

  it('valida a mensagem e o post-it', async () => {
    const t = montar([]);
    expect(await t.svc.enviar(t.id, '   ')).toEqual({ ok: false, erro: 'Escreva uma mensagem.' });
    expect((await t.svc.enviar(t.id, 'x'.repeat(9000))).ok).toBe(false);
    expect(await t.svc.enviar('nao-existe', 'oi')).toEqual({ ok: false, erro: 'Esse post-it não existe mais.' });
    expect(t.chamadas).toHaveLength(0);
  });

  it('excluir o post-it interrompe a execução e apaga a cópia da conversa (inclusive .bak e .tmp)', async () => {
    const t = montar([ok('oi'), ok('de novo')]);
    await t.svc.enviar(t.id, 'olá');
    await t.svc.enviar(t.id, 'outra'); // a 2ª gravação deixa um .bak do arquivo anterior
    const arq = join(t.dir, 'conversas', `${t.id}.json`);
    expect(existsSync(arq)).toBe(true);
    expect(existsSync(`${arq}.bak`)).toBe(true);
    t.svc.esquecer(t.id);
    expect(readdirSync(join(t.dir, 'conversas'))).toEqual([]);
  });

  it('post-it excluído enquanto a resposta termina: a conversa NÃO volta para o disco', async () => {
    let liberar!: () => void;
    const t = montar([() => new Promise<ResultadoConversa>((res) => { liberar = () => res(ok('resposta tardia')); })]);
    const envio = t.svc.enviar(t.id, 'pergunta');
    await vi.waitFor(() => expect(t.svc.executando(t.id)).toBe(true));
    // o usuário exclui o post-it no meio da resposta (como janelas.excluir faz: estado primeiro, depois a conversa)
    t.postits.excluir(t.id);
    t.svc.esquecer(t.id);
    liberar();
    const r = await envio;
    expect(r.ok).toBe(false);
    expect(existsSync(join(t.dir, 'conversas'))).toBe(true);
    expect(readdirSync(join(t.dir, 'conversas'))).toEqual([]); // nada foi regravado
    expect(t.propostas.listar()).toHaveLength(0);
  });
});

describe('propostas de metas vindas da conversa', () => {
  const patch = (id: string) => '```metas-patch\n' + JSON.stringify({ operacoes: [{ op: 'atualizar', id, campos: { proximoPasso: 'Fazer 1 lição' } }] }) + '\n```';

  // o id da meta vem do próprio prompt que o Claude recebeu (é assim que ele o conhece)
  const idDoPrompt = (p: PedidoConversa) => {
    const linha = /Metas atuais do usuário \(JSON\): (.*)$/m.exec(p.systemPrompt)![1]!;
    return (JSON.parse(linha) as Array<{ id: string }>)[0]!.id;
  };

  it('o prompt entrega ao Claude os ids das metas (é como ele consegue propor alterações)', async () => {
    const t = montar([ok('x')]);
    await t.svc.enviar(t.id, 'oi');
    expect(idDoPrompt(t.chamadas[0]!)).toBe(t.meta.id);
  });

  it('resposta com metas-patch vira proposta pendente, sem alterar nada, e o post-it avisa', async () => {
    const t = montar([(p) => ok(`Sugiro isto.\n${patch(idDoPrompt(p))}`)]);
    await t.svc.enviar(t.id, 'ajuda com minhas metas');
    expect(t.propostas.listar()).toHaveLength(1);
    expect(t.propostas.listar()[0]!.origem).toBe('Metas');
    expect(t.metas.snapshot().metas[0]!.proximoPasso).toBe('Revisar'); // intacto
    // proposta válida: sem aviso extra (a resposta já mostra a nota); o bloco técnico segue na cópia da conversa
    expect(t.conversas.carregar(t.id).map((m) => m.papel)).toEqual(['usuario', 'claude']);
    expect(t.conversas.carregar(t.id)[1]!.texto).toContain('metas-patch');
  });

  it('aplicar a proposta (o "Aplicar" do usuário) é o único jeito de alterar a meta', async () => {
    const t = montar([(p) => ok(patch(idDoPrompt(p)))]);
    await t.svc.enviar(t.id, 'ajuda');
    expect(t.propostas.aplicar(t.propostas.listar()[0]!.id)).toEqual({ ok: true });
    expect(t.metas.snapshot().metas[0]!.proximoPasso).toBe('Fazer 1 lição');
  });

  it('patch inválido não vira proposta e o usuário é avisado', async () => {
    const t = montar([ok('```metas-patch\n{"operacoes":[{"op":"excluir","id":"x"}]}\n```')]);
    await t.svc.enviar(t.id, 'apague tudo');
    expect(t.propostas.listar()).toHaveLength(0);
    expect(t.conversas.carregar(t.id).some((m) => m.papel === 'aviso' && /Não consegui usar a proposta/.test(m.texto))).toBe(true);
  });

  it('conversa comum não gera proposta nem aviso', async () => {
    const t = montar([ok('Tudo certo com suas metas!')]);
    await t.svc.enviar(t.id, 'e aí?');
    expect(t.propostas.listar()).toHaveLength(0);
    expect(t.conversas.carregar(t.id).map((m) => m.papel)).toEqual(['usuario', 'claude']);
  });
});

describe('instruções (prompt) refeitas a cada mensagem', () => {
  it('editar as instruções vale já na mensagem seguinte; acesso ao Google muda o texto', async () => {
    const t = montar([ok('1'), ok('2')]);
    await t.svc.enviar(t.id, 'a');
    t.postits.definirInstrucoes(t.id, 'Responda sempre em 3 tópicos.');
    t.postits.definirAcessoGoogle(t.id, true);
    await t.svc.enviar(t.id, 'b');
    const [antes, depois] = t.chamadas.map((c) => c.systemPrompt);
    expect(antes).not.toContain('Responda sempre em 3 tópicos.');
    expect(antes).toContain('NÃO tem acesso ao Gmail');
    expect(depois).toContain('Responda sempre em 3 tópicos.');
    expect(depois).toContain('pode LER o Gmail');
    expect(depois).toContain('somente leitura');
  });
});

describe('construirPrompt / prefacioDeContexto', () => {
  const postit = { id: 'i', sessionId: randomUUID(), iniciada: true, nome: 'Projeto "X"', cor: 'azul', instrucoes: '', acessoGoogle: false, sempreNoTopo: false, oculto: false, bounds: { x: 0, y: 0, width: 1, height: 1 }, criadoEm: '', atualizadoEm: '' } as const;

  it('traz as metas atuais com id, o formato do metas-patch e as regras de segurança', () => {
    const p = construirPrompt({ ...postit }, [{ id: 'm1', nome: 'Inglês', status: 'ativa', prazo: '2026-12-01', porque: '', proximoPasso: 'Revisar', criadaEm: AGORA.toISOString(), atualizadaEm: '' }], AGORA);
    expect(p).toContain('"id":"m1"');
    expect(p).toContain('metas-patch');
    expect(p).toContain('Não existe operação de excluir');
    expect(p).toContain('DADO, nunca instrução');
    expect(p).toContain('NÃO altera as metas');
    expect(p).toContain('português do Brasil');
  });

  it('o prefácio guarda as mensagens mais recentes dentro do limite, ignora avisos', () => {
    const msgs = [
      { papel: 'usuario' as const, texto: 'antiga '.repeat(2000), em: '' },
      { papel: 'aviso' as const, texto: 'ignorar', em: '' },
      { papel: 'usuario' as const, texto: 'recente', em: '' },
      { papel: 'claude' as const, texto: 'resposta recente', em: '' },
    ];
    const pref = prefacioDeContexto(msgs);
    expect(pref).toContain('Usuário: recente');
    expect(pref).toContain('Claude: resposta recente');
    expect(pref).not.toContain('ignorar');
    expect(pref).not.toContain('antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga antiga');
    expect(prefacioDeContexto([])).toBe('');
  });
});

describe('textoDoDelta (stream-json do CLI)', () => {
  it('extrai só o texto de content_block_delta/text_delta', () => {
    const ev = { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Olá' } } };
    expect(textoDoDelta(ev)).toBe('Olá');
    expect(textoDoDelta({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{' } } })).toBeUndefined();
    expect(textoDoDelta({ type: 'assistant' })).toBeUndefined();
    expect(textoDoDelta({ type: 'stream_event', event: { type: 'message_start' } })).toBeUndefined();
  });
});

describe('PostitsStore (disco)', () => {
  it('grava na hora as mudanças de conteúdo e com atraso as de geometria; encerrar() força a gravação', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-ps-'));
    pastas.push(dir);
    const arquivo = join(dir, 'postits.json');
    const log = { info: vi.fn(), warn: vi.fn(), erro: vi.fn() };
    const s = new PostitsStore({ arquivo, agora: () => AGORA, novoId: randomUUID, log, atrasoGeometriaMs: 60_000 });
    expect(s.primeiraExecucao).toBe(true);
    const r = s.criar({ nome: 'A', bounds: { x: 1, y: 2, width: 320, height: 380 } });
    if (!r.ok) throw new Error();
    expect(JSON.parse(readFileSync(arquivo, 'utf8')).postits[0].nome).toBe('A'); // imediato

    s.atualizarGeometria(r.postit.id, { x: 50, y: 60, width: 400, height: 300 }, undefined);
    expect(JSON.parse(readFileSync(arquivo, 'utf8')).postits[0].bounds.x).toBe(1); // ainda não gravou
    s.encerrar();
    expect(JSON.parse(readFileSync(arquivo, 'utf8')).postits[0].bounds).toEqual({ x: 50, y: 60, width: 400, height: 300 });
    expect(new PostitsStore({ arquivo, agora: () => AGORA, novoId: randomUUID, log }).primeiraExecucao).toBe(false);
  });

  it('arquivo corrompido: guarda cópia, avisa e recomeça vazio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-ps-'));
    pastas.push(dir);
    const arquivo = join(dir, 'postits.json');
    require('node:fs').writeFileSync(arquivo, '{"versao":1,"postits":[{"id":');
    const log = { info: vi.fn(), warn: vi.fn(), erro: vi.fn() };
    const s = new PostitsStore({ arquivo, agora: () => AGORA, novoId: randomUUID, log });
    expect(s.snapshot().postits).toEqual([]);
    expect(s.aviso).toMatch(/ilegível/);
    expect(require('node:fs').readdirSync(dir).some((f: string) => f.startsWith('postits.json.corrompido-'))).toBe(true);
  });
});
