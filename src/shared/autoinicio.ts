export interface EstadoAutoInicio {
  /** false = não dá para ligar neste modo (ex.: rodando a partir do código). */
  disponivel: boolean;
  motivo?: string;
  ativo: boolean;
  /** A entrada existe, mas o Windows a desativou (o usuário desligou nas Configurações do Windows). */
  bloqueadoPeloWindows: boolean;
  /** O usuário já confirmou uma vez: ligar de novo não pergunta outra vez. */
  jaConfirmou: boolean;
  /** Programa que o Windows executará no login. */
  caminho: string;
}

export type ResultadoAuto = { ok: true; estado: EstadoAutoInicio } | { ok: false; erro: string };
