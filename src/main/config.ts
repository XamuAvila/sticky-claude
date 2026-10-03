import { z } from 'zod';
import { caminhos } from './paths';
import { lerJson } from './storage';

/** %APPDATA%\StickyClaude\config.json (opcional). Todos os campos são opcionais. */
const ConfigSchema = z.object({
  /** Caminho do claude.exe, se não estiver em ~\.local\bin nem no PATH. */
  claudePath: z.string().min(1).optional(),
  /** Dias sem avanço para uma meta ativa ser avisada como parada (padrão 7). */
  metasParadaDias: z.number().int().min(1).max(365).optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

export function lerConfig(): Config {
  return lerJson(caminhos.config(), (u) => ConfigSchema.parse(u)) ?? {};
}
