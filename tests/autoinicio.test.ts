import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARGUMENTO_LOGIN, AutoInicio, MOTIVO_SO_EMPACOTADO, caminhoDeInicializacao, criarBackendElectron, criarBackendFalso,
  type BackendEntrada, type LeituraEntrada,
} from '../src/main/autoinicio';

const logger = () => ({ info: vi.fn(), warn: vi.fn(), erro: vi.fn() });

/** "Registro" de mentira em memória. `falhaAoCriar` imita uma política do Windows que ignora a gravação. */
function backendMemoria(opcoes: { falhaAoCriar?: boolean; falhaAoRemover?: boolean; lanca?: boolean; bloqueado?: boolean } = {}) {
  let entrada = false;
  const chamadas: boolean[] = [];
  const b: BackendEntrada = {
    ler: (): LeituraEntrada => ({ entrada, vaiExecutar: entrada && !opcoes.bloqueado }),
    definir: (ligar) => {
      chamadas.push(ligar);
      if (opcoes.lanca) throw new Error('acesso negado');
      if (ligar && !opcoes.falhaAoCriar) entrada = true;
      if (!ligar && !opcoes.falhaAoRemover) entrada = false;
    },
  };
  return { b, chamadas, existe: () => entrada };
}

function montar(backend: BackendEntrada | null, jaConfirmouInicial = false) {
  let confirmou = jaConfirmouInicial;
  const log = logger();
  const auto = new AutoInicio({
    backend, motivo: MOTIVO_SO_EMPACOTADO, caminho: 'C:\\Apps\\Sticky Claude.exe',
    jaConfirmou: () => confirmou, guardarConfirmacao: () => { confirmou = true; }, log,
  });
  return { auto, log, confirmou: () => confirmou };
}

describe('AutoInicio: confirmação do usuário', () => {
  it('na primeira vez, ligar SEM confirmação é recusado e o registro nem é tocado', () => {
    const m = backendMemoria();
    const { auto } = montar(m.b);
    const r = auto.definir(true, false);
    expect(r).toEqual({ ok: false, erro: 'Preciso da sua confirmação antes de criar a entrada de inicialização.' });
    expect(m.chamadas).toEqual([]);
    expect(m.existe()).toBe(false);
  });

  it('com confirmação, cria a entrada, guarda a confirmação e relê o estado', () => {
    const m = backendMemoria();
    const t = montar(m.b);
    const r = t.auto.definir(true, true);
    expect(r.ok && r.estado).toMatchObject({ disponivel: true, ativo: true, jaConfirmou: true, bloqueadoPeloWindows: false });
    expect(m.existe()).toBe(true);
    expect(t.confirmou()).toBe(true);
  });

  it('depois de confirmar uma vez, ligar de novo não pergunta outra vez', () => {
    const m = backendMemoria();
    const { auto } = montar(m.b);
    auto.definir(true, true);
    auto.definir(false, false);
    expect(m.existe()).toBe(false);
    expect(auto.definir(true, false).ok).toBe(true);
    expect(m.existe()).toBe(true);
  });

  it('desligar nunca exige confirmação e REMOVE a entrada de verdade', () => {
    const m = backendMemoria();
    const { auto } = montar(m.b, true);
    auto.definir(true, false);
    expect(m.existe()).toBe(true);
    const r = auto.definir(false, false);
    expect(r.ok && r.estado.ativo).toBe(false);
    expect(m.existe()).toBe(false);
    expect(m.chamadas).toEqual([true, false]);
  });
});

describe('AutoInicio: nunca afirma o que não aconteceu', () => {
  it('se o Windows ignora a gravação, devolve erro (e não guarda a confirmação)', () => {
    const m = backendMemoria({ falhaAoCriar: true });
    const t = montar(m.b);
    const r = t.auto.definir(true, true);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Não consegui criar/);
    expect(t.confirmou()).toBe(false);
    expect(t.log.erro).toHaveBeenCalled();
  });

  it('se não conseguir remover, avisa', () => {
    const m = backendMemoria({ falhaAoRemover: true });
    const { auto } = montar(m.b, true);
    auto.definir(true, false);
    const r = auto.definir(false, false);
    expect(!r.ok && r.erro).toMatch(/Não consegui remover/);
  });

  it('exceção do sistema vira mensagem amigável, sem vazar detalhes', () => {
    const { auto, log } = montar(backendMemoria({ lanca: true }).b, true);
    const r = auto.definir(true, true);
    expect(r).toEqual({ ok: false, erro: 'O Windows não deixou alterar a inicialização automática.' });
    expect(log.erro).toHaveBeenCalled();
  });

  it('entrada existe mas o Windows a desativou (Configurações > Inicialização): avisa', () => {
    const m = backendMemoria({ bloqueado: true });
    const { auto } = montar(m.b, true);
    const r = auto.definir(true, false);
    expect(r.ok && r.estado).toMatchObject({ ativo: true, bloqueadoPeloWindows: true });
  });
});

describe('AutoInicio: modo sem backend (rodando a partir do código)', () => {
  it('fica indisponível, explica por quê e recusa qualquer alteração', () => {
    const { auto } = montar(null);
    expect(auto.estado()).toMatchObject({ disponivel: false, ativo: false, motivo: MOTIVO_SO_EMPACOTADO });
    expect(auto.definir(true, true)).toEqual({ ok: false, erro: MOTIVO_SO_EMPACOTADO });
    expect(auto.definir(false, false).ok).toBe(false);
  });
});

describe('caminho e backend do Electron', () => {
  it('no app portátil usa o .exe que o usuário abriu, não a cópia temporária', () => {
    expect(caminhoDeInicializacao({ PORTABLE_EXECUTABLE_FILE: 'D:\\Apps\\Sticky-Claude-Portatil.exe' }, 'C:\\Temp\\x\\Sticky Claude.exe')).toBe('D:\\Apps\\Sticky-Claude-Portatil.exe');
    expect(caminhoDeInicializacao({}, 'C:\\Users\\u\\AppData\\Local\\Programs\\Sticky Claude\\Sticky Claude.exe')).toBe('C:\\Users\\u\\AppData\\Local\\Programs\\Sticky Claude\\Sticky Claude.exe');
  });

  it('liga e desliga com o executável e o argumento --autostart, e lê o estado de volta', () => {
    const get = vi.fn().mockReturnValue({ openAtLogin: true, executableWillLaunchAtLogin: false });
    const set = vi.fn();
    const b = criarBackendElectron({ getLoginItemSettings: get, setLoginItemSettings: set } as never, 'C:\\App\\Sticky Claude.exe');
    b.definir(true);
    b.definir(false);
    expect(set).toHaveBeenNthCalledWith(1, { openAtLogin: true, path: 'C:\\App\\Sticky Claude.exe', args: [ARGUMENTO_LOGIN] });
    expect(set).toHaveBeenNthCalledWith(2, { openAtLogin: false, path: 'C:\\App\\Sticky Claude.exe', args: [ARGUMENTO_LOGIN] });
    expect(b.ler()).toEqual({ entrada: true, vaiExecutar: false });
    expect(get).toHaveBeenCalledWith({ path: 'C:\\App\\Sticky Claude.exe', args: ['--autostart'] });
  });

  it('o argumento de login é o que o app reconhece', () => {
    expect(ARGUMENTO_LOGIN).toBe('--autostart');
  });
});

describe('entrada falsa (desenvolvimento/E2E)', () => {
  const pastas: string[] = [];
  afterEach(() => { while (pastas.length) rmSync(pastas.pop()!, { recursive: true, force: true }); });

  it('um arquivo faz o papel do registro: liga, lê e desliga', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-auto-'));
    pastas.push(dir);
    const b = criarBackendFalso(join(dir, 'f.json'));
    expect(b.ler()).toEqual({ entrada: false, vaiExecutar: false });
    b.definir(true);
    expect(b.ler()).toEqual({ entrada: true, vaiExecutar: true });
    b.definir(false);
    expect(b.ler().entrada).toBe(false);
  });
});

describe('preferências gravadas pelo app', () => {
  it('guarda a confirmação sem apagar outras escolhas', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sticky-pref-'));
    process.env.STICKY_DATA_DIR = dir;
    try {
      const { lerPreferencias, gravarPreferencias } = await import('../src/main/preferencias');
      expect(lerPreferencias()).toEqual({});
      gravarPreferencias({ autoInicioConfirmado: true });
      expect(lerPreferencias()).toEqual({ autoInicioConfirmado: true });
    } finally {
      delete process.env.STICKY_DATA_DIR;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
