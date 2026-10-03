import { useEffect, useRef, useState } from 'react';
import type { ConteudoPilula } from '@shared/pilula';

/**
 * A janela é transparente e deixa o mouse passar. Enquanto o ponteiro está sobre a pílula, a tela avisa o processo principal
 * (que passa a capturar o mouse) e a pílula se expande; ao sair, tudo volta ao normal.
 */
export function App() {
  const [c, setC] = useState<ConteudoPilula | null>(null);
  const [aberta, setAberta] = useState(false);
  const sobre = useRef(false);
  const fechar = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    void window.sticky.pilula.obter().then((v) => { if (vivo) setC(v); });
    const cancelar = window.sticky.pilula.aoMudar(setC);
    return () => { vivo = false; cancelar(); };
  }, []);

  useEffect(() => {
    const aoMover = (e: MouseEvent) => {
      const dentro = !!(e.target as HTMLElement | null)?.closest('.pilula');
      if (dentro === sobre.current) return;
      sobre.current = dentro;
      clearTimeout(fechar.current);
      if (dentro) {
        void window.sticky.pilula.interativa(true);
        setAberta(true);
      } else {
        // pequeno atraso: não fecha por um tremor do mouse na borda
        fechar.current = setTimeout(() => { setAberta(false); void window.sticky.pilula.interativa(false); }, 220);
      }
    };
    window.addEventListener('mousemove', aoMover);
    return () => window.removeEventListener('mousemove', aoMover);
  }, []);

  if (!c) return null;
  return (
    <div className="palco">
      <div
        className={`pilula modo-${c.modo}${aberta ? ' aberta' : ''}${c.urgente ? ' urgente' : ''}`}
        role="button" tabIndex={-1} aria-label={`${c.rotulo}: ${c.titulo}. ${c.detalhe}. Clique para abrir o painel.`}
        onClick={() => void window.sticky.pilula.abrirPainel()}
      >
        <div className="linha">
          <span className="ponto" aria-hidden="true" />
          <span className="rotulo">{c.rotulo}</span>
          <span className="titulo">{c.titulo}</span>
          <span className="detalhe">{c.detalhe}</span>
        </div>
        <div className="extra" aria-hidden={!aberta}>
          <div className="extra-interno">
            {c.eventos.length > 0 && (
              <ul className="eventos">
                {c.eventos.map((e, i) => (
                  <li key={`${e.titulo}-${e.hora}-${i}`} className={e.agora ? 'agora' : ''}>
                    <span className="hora">{e.hora}</span>
                    <span className="nome">{e.titulo}</span>
                    {e.agora && <span className="selo">agora</span>}
                  </li>
                ))}
              </ul>
            )}
            {c.meta && (
              <div className={`meta${c.meta.alerta ? ` ${c.meta.alerta}` : ''}`}>
                <span className="meta-rotulo">Meta do dia</span>
                <span className="meta-nome">{c.meta.nome}</span>
                <span className="meta-situacao">{c.meta.situacao}{c.meta.alerta === 'parada' ? ' · parada' : ''}</span>
                <span className="meta-passo">{c.meta.passo}</span>
              </div>
            )}
            <div className="dica">Clique para abrir o painel</div>
          </div>
        </div>
      </div>
    </div>
  );
}
