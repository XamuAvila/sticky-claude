import type { ReactNode } from 'react';

/** Bloco ```metas-patch (proposta de alteração das metas) some do texto; o diálogo do painel mostra o que muda. */
export function separarPatch(texto: string): { limpo: string; temPatch: boolean } {
  const re = /```metas-patch[\s\S]*?(?:```|$)/gi;
  return { limpo: texto.replace(re, '').trim(), temPatch: re.test(texto) || /```metas-patch/i.test(texto) };
}

/** **negrito** e `código` em linha, sem HTML cru (React escapa tudo). */
function emLinha(s: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let ultimo = 0;
  let i = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > ultimo) partes.push(s.slice(ultimo, m.index));
    const t = m[0];
    partes.push(t.startsWith('**') ? <strong key={`${chave}-${i++}`}>{t.slice(2, -2)}</strong> : <code key={`${chave}-${i++}`}>{t.slice(1, -1)}</code>);
    ultimo = m.index + t.length;
  }
  if (ultimo < s.length) partes.push(s.slice(ultimo));
  return partes;
}

const ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;

function Blocos({ texto, chave }: { texto: string; chave: string }) {
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      {paragrafos.map((p, i) => {
        const linhas = p.split('\n');
        if (linhas.every((l) => ITEM.test(l))) {
          return <ul key={`${chave}-${i}`}>{linhas.map((l, j) => <li key={j}>{emLinha(l.replace(ITEM, ''), `${chave}-${i}-${j}`)}</li>)}</ul>;
        }
        return (
          <p key={`${chave}-${i}`}>
            {linhas.map((l, j) => <span key={j}>{j > 0 && <br />}{emLinha(l, `${chave}-${i}-${j}`)}</span>)}
          </p>
        );
      })}
    </>
  );
}

/** Texto da resposta do Claude: parágrafos, listas, negrito, código e blocos de código. */
export function Formatado({ texto }: { texto: string }) {
  const { limpo, temPatch } = separarPatch(texto);
  const pedacos = limpo.split(/```[^\n]*\n?([\s\S]*?)(?:```|$)/);
  return (
    <div className="formatado">
      {pedacos.map((p, i) => (i % 2 === 1 ? <pre key={i}>{p.trim()}</pre> : <Blocos key={i} texto={p} chave={String(i)} />))}
      {temPatch && <div className="nota-patch">📝 Propus alterar suas metas. Confira o que muda e confirme no painel.</div>}
    </div>
  );
}
