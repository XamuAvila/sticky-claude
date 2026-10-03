// Inicialização com o Windows. A ÚNICA coisa que o app muda no sistema, e só com a confirmação do usuário:
// uma entrada em HKCU\Software\Microsoft\Windows\CurrentVersion\Run (só o usuário atual, sem administrador),
// que o desligar remove de verdade.
import { existsSync, readFileSync } from 'node:fs';
import type { App } from 'electron';
import type { EstadoAutoInicio, ResultadoAuto } from '@shared/autoinicio';
import type { Logger } from './log';
import { gravarJsonAtomico } from './storage';

/** O que o app sabe sobre a entrada de inicialização. */
export interface LeituraEntrada {
  /** A entrada existe no registro (com este executável e estes argumentos). */
  entrada: boolean;
  /** O Windows vai mesmo executá-la no login (não foi desativada em Configurações > Aplicativos > Inicialização). */
  vaiExecutar: boolean;
}

export interface BackendEntrada {
  ler(): LeituraEntrada;
  definir(ligar: boolean): void;
}

export const ARGUMENTO_LOGIN = '--autostart';

/** No app portátil, process.execPath é uma cópia temporária: o caminho certo é o do .exe que o usuário abriu. */
export function caminhoDeInicializacao(env: NodeJS.ProcessEnv, execPath: string): string {
  return env.PORTABLE_EXECUTABLE_FILE || execPath;
}

export const MOTIVO_SO_EMPACOTADO =
  'Disponível no app instalado ou portátil. Rodando a partir do código, a entrada apontaria para o Electron de desenvolvimento.';

interface Deps {
  /** null = indisponível neste modo (veja `motivo`). */
  backend: BackendEntrada | null;
  motivo?: string;
  caminho: string;
  jaConfirmou: () => boolean;
  guardarConfirmacao: () => void;
  log: Logger;
}

export class AutoInicio {
  constructor(private readonly d: Deps) {}

  estado(): EstadoAutoInicio {
    const base = { jaConfirmou: this.d.jaConfirmou(), caminho: this.d.caminho };
    if (!this.d.backend) {
      return { ...base, disponivel: false, motivo: this.d.motivo ?? MOTIVO_SO_EMPACOTADO, ativo: false, bloqueadoPeloWindows: false };
    }
    const l = this.d.backend.ler();
    return { ...base, disponivel: true, ativo: l.entrada, bloqueadoPeloWindows: l.entrada && !l.vaiExecutar };
  }

  /**
   * Liga ou desliga. Ligar exige a confirmação do usuário na primeira vez (`confirmado`);
   * depois de ligar/desligar, relê o registro para ter certeza de que o resultado é o pedido.
   */
  definir(ligar: boolean, confirmado: boolean): ResultadoAuto {
    const b = this.d.backend;
    if (!b) return { ok: false, erro: this.d.motivo ?? MOTIVO_SO_EMPACOTADO };
    if (ligar && !confirmado && !this.d.jaConfirmou()) {
      return { ok: false, erro: 'Preciso da sua confirmação antes de criar a entrada de inicialização.' };
    }
    try {
      b.definir(ligar);
    } catch (e) {
      this.d.log.erro('falha ao mexer na entrada de inicialização', { ligar, motivo: String(e).slice(0, 100) });
      return { ok: false, erro: 'O Windows não deixou alterar a inicialização automática.' };
    }
    const depois = b.ler();
    if (depois.entrada !== ligar) {
      this.d.log.erro('a entrada de inicialização não ficou como pedido', { ligar, entrada: depois.entrada });
      return { ok: false, erro: ligar ? 'Não consegui criar a entrada de inicialização (uma política do Windows pode estar bloqueando).' : 'Não consegui remover a entrada de inicialização.' };
    }
    if (ligar) this.d.guardarConfirmacao();
    this.d.log.info(ligar ? 'inicialização automática ligada' : 'inicialização automática desligada', { vaiExecutar: depois.vaiExecutar });
    return { ok: true, estado: this.estado() };
  }
}

/**
 * Entrada de verdade, via app.setLoginItemSettings (HKCU\...\Run, só do usuário). O nome do valor no registro é o
 * AppUserModelId do app (o Electron não lê outro nome de volta); o desinstalador remove exatamente esse valor.
 */
export function criarBackendElectron(app: Pick<App, 'getLoginItemSettings' | 'setLoginItemSettings'>, caminho: string): BackendEntrada {
  const opcoes = { path: caminho, args: [ARGUMENTO_LOGIN] };
  return {
    ler: () => {
      const s = app.getLoginItemSettings(opcoes);
      return { entrada: s.openAtLogin, vaiExecutar: s.executableWillLaunchAtLogin };
    },
    definir: (ligar) => app.setLoginItemSettings({ openAtLogin: ligar, ...opcoes }),
  };
}

/** Entrada de MENTIRA (só desenvolvimento e testes E2E): um arquivo no lugar do registro. */
export function criarBackendFalso(arquivo: string): BackendEntrada {
  const ler = (): boolean => {
    try {
      return existsSync(arquivo) && (JSON.parse(readFileSync(arquivo, 'utf8')) as { entrada?: boolean }).entrada === true;
    } catch {
      return false;
    }
  };
  return {
    ler: () => ({ entrada: ler(), vaiExecutar: ler() }),
    definir: (ligar) => gravarJsonAtomico(arquivo, { entrada: ligar }),
  };
}
