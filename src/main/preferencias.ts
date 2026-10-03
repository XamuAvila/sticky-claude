import { z } from 'zod';
import { caminhos } from './paths';
import { gravarJsonAtomico, lerJson } from './storage';

/** Escolhas que o próprio app grava (diferente de config.json, que o usuário edita à mão). */
const PreferenciasSchema = z.object({
  /** O usuário já confirmou, uma vez, a criação da entrada de inicialização. */
  autoInicioConfirmado: z.boolean().optional(),
  /** Mostrar a pílula no topo da tela (padrão: sim). */
  pilulaAtiva: z.boolean().optional(),
});
export type Preferencias = z.infer<typeof PreferenciasSchema>;

export function lerPreferencias(): Preferencias {
  return lerJson(caminhos.preferencias(), (u) => PreferenciasSchema.parse(u)) ?? {};
}

export function gravarPreferencias(p: Preferencias): void {
  gravarJsonAtomico(caminhos.preferencias(), { ...lerPreferencias(), ...p });
}
