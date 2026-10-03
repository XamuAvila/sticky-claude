// Tipos dos post-its (sem zod: a tela também importa este arquivo).

export const CORES = ['amarelo', 'rosa', 'verde', 'azul', 'laranja', 'lilas'] as const;
export type CorPostit = (typeof CORES)[number];

export const ROTULO_COR: Record<CorPostit, string> = {
  amarelo: 'Amarelo', rosa: 'Rosa', verde: 'Verde', azul: 'Azul', laranja: 'Laranja', lilas: 'Lilás',
};

export const LIMITE_NOME = 40;
export const LIMITE_INSTRUCOES = 2000;
export const LIMITE_MENSAGEM = 8000;

export interface Retangulo {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A tela (monitor) em que o post-it estava quando foi salvo. Serve para achá-la de novo depois de reiniciar. */
export interface TelaSalva {
  id: number;
  /** Retângulo da tela no momento do salvamento (em DIPs). */
  bounds: Retangulo;
  scaleFactor: number;
}

export interface Postit {
  id: string;
  /** Sessão do Claude desta conversa (--session-id na 1ª vez, --resume depois). */
  sessionId: string;
  /** Já existe uma sessão gravada no Claude Code (a partir daqui, sempre --resume). */
  iniciada: boolean;
  nome: string;
  cor: CorPostit;
  instrucoes: string;
  /** Pode ler Gmail e Calendar (somente leitura). */
  acessoGoogle: boolean;
  sempreNoTopo: boolean;
  /** Escondido de propósito pelo usuário (X ou menu da bandeja). */
  oculto: boolean;
  bounds: Retangulo;
  tela?: TelaSalva;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MensagemPostit {
  papel: 'usuario' | 'claude' | 'aviso';
  texto: string;
  em: string;
  /** Resposta interrompida (erro ou "Parar"). */
  parcial?: boolean;
}

export interface VisaoPostit {
  postit: Postit;
  mensagens: MensagemPostit[];
  executando: boolean;
}

export type EventoPostit =
  | { tipo: 'estado'; visao: VisaoPostit }
  /** Pedaço de texto da resposta que está chegando. */
  | { tipo: 'delta'; texto: string };

/** O que a bandeja e o painel mostram na lista. */
export interface ResumoPostit {
  id: string;
  nome: string;
  cor: CorPostit;
  oculto: boolean;
  /** Janela visível agora. */
  visivel: boolean;
}

/** Cor de fundo da janela (antes da tela carregar), por tema do Windows. A tela repete essas cores em CSS. */
export const FUNDO_CLARO: Record<CorPostit, string> = {
  amarelo: '#fff3a3', rosa: '#ffd6e7', verde: '#d3f5cf', azul: '#cfe6ff', laranja: '#ffe0bd', lilas: '#e6d9ff',
};
export const FUNDO_ESCURO: Record<CorPostit, string> = {
  amarelo: '#4b4217', rosa: '#4a2336', verde: '#25402a', azul: '#223a52', laranja: '#4d3318', lilas: '#38294f',
};

export const TAMANHO_PADRAO = { width: 320, height: 380 } as const;
export const TAMANHO_MINIMO = { width: 240, height: 220 } as const;
