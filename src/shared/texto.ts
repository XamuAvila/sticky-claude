/** Tira controles e espaços repetidos e limita o tamanho (texto vindo de e-mail, convite ou do Claude não é confiável). */
export function limpar(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
