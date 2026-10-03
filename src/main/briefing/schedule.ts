import type { Briefing } from '@shared/briefing';

/** Se o briefing em cache for mais novo que isso e sem erros, o início do app só mostra o cache. */
export const CACHE_FRESCO_MIN = 20;

/** No início do app: roda o briefing? (Nunca em loop; o botão "Atualizar" sempre roda.) */
export function deveRodarNoInicio(b: Briefing, agora: Date, minFresco = CACHE_FRESCO_MIN): boolean {
  if (!b.geradoEm) return true;
  const t = new Date(b.geradoEm).getTime();
  if (Number.isNaN(t)) return true;
  const idadeMin = (agora.getTime() - t) / 60_000;
  const incompleto = [b.agenda, b.emails, b.foco].some((s) => s.status === 'erro' || s.status === 'vazio');
  return idadeMin >= minFresco || idadeMin < 0 || incompleto;
}
