import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CORES, LIMITE_INSTRUCOES, LIMITE_MENSAGEM, ROTULO_COR, type CorPostit, type MensagemPostit, type VisaoPostit } from '@shared/postits';
import { Formatado } from './Formatado';

const Icone = ({ d, ...p }: { d: string } & React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d={d} /></svg>
);
const ICONES = {
  alfinete: 'M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z',
  menu: 'M5 12h.01M12 12h.01M19 12h.01',
  fechar: 'M6 6l12 12M18 6L6 18',
};

function Bolha({ m }: { m: MensagemPostit }) {
  if (m.papel === 'aviso') return <div className="msg aviso" role="status">{m.texto}</div>;
  if (m.papel === 'usuario') return <div className="msg usuario">{m.texto}</div>;
  return (
    <div className="msg claude">
      <Formatado texto={m.texto} />
      {m.parcial && <div className="parcial">(resposta interrompida)</div>}
    </div>
  );
}

function Titulo({ nome, onSalvar }: { nome: string; onSalvar: (n: string) => Promise<string | null> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  const [erro, setErro] = useState('');
  useEffect(() => { if (!editando) setValor(nome); }, [nome, editando]);

  async function confirmar() {
    if (valor.trim() === nome) { setEditando(false); return; }
    const e = await onSalvar(valor);
    if (e) { setErro(e); return; }
    setErro('');
    setEditando(false);
  }

  return editando ? (
    <span className="titulo editando">
      <input autoFocus value={valor} maxLength={40} aria-label="Nome do post-it" aria-invalid={!!erro} title={erro}
        onChange={(e) => setValor(e.target.value)} onBlur={() => void confirmar()}
        onKeyDown={(e) => { if (e.key === 'Enter') void confirmar(); if (e.key === 'Escape') { setEditando(false); setErro(''); } }} />
    </span>
  ) : (
    <button type="button" className="titulo" title="Clique para renomear" onClick={() => setEditando(true)}>{nome}</button>
  );
}

export function App() {
  const id = useMemo(() => new URLSearchParams(location.search).get('id') ?? '', []);
  const [visao, setVisao] = useState<VisaoPostit | null | undefined>(undefined);
  const [fluxo, setFluxo] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [menu, setMenu] = useState(false);
  const [dialogoInstrucoes, setDialogoInstrucoes] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);
  const conversaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const colarNoFim = useRef(true);

  useEffect(() => {
    let vivo = true;
    void window.sticky.postit.obter(id).then((v) => { if (vivo) setVisao(v); });
    const cancelar = window.sticky.postit.aoEvento((e) => {
      if (e.tipo === 'delta') setFluxo((f) => f + e.texto);
      else { setVisao(e.visao); if (!e.visao.executando) setFluxo(''); }
    });
    return () => { vivo = false; cancelar(); };
  }, [id]);

  // fecha o menu ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.menu, .botao-menu')) { setMenu(false); setConfirmaExcluir(false); } };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setConfirmaExcluir(false); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);

  // rolagem: acompanha o fim, a menos que o usuário tenha subido para reler
  const mensagens = visao?.mensagens;
  useLayoutEffect(() => {
    const el = conversaRef.current;
    if (el && colarNoFim.current) el.scrollTop = el.scrollHeight;
  }, [mensagens, fluxo]);

  useEffect(() => {
    campoRef.current?.focus();
    const f = () => campoRef.current?.focus();
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, []);

  if (visao === undefined) return <div className="abrindo">Abrindo…</div>;
  if (visao === null) return <div className="abrindo">Este post-it não existe mais.</div>;

  const { postit: p, mensagens: msgs, executando } = visao;
  const api = window.sticky.postit;

  async function enviar() {
    const t = texto.trim();
    if (!t || executando) return;
    setErro('');
    setTexto('');
    colarNoFim.current = true;
    const r = await api.enviar(id, t);
    if (!r.ok) setErro(r.erro);
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
  }

  const trocarCor = (c: CorPostit) => void api.cor(id, c);

  return (
    <div className="postit" data-cor={p.cor}>
      <header className="barra">
        <Titulo nome={p.nome} onSalvar={async (n) => { const r = await api.renomear(id, n); return r.ok ? null : r.erro; }} />
        <span className="espaco" />
        <button type="button" className="icone" aria-pressed={p.sempreNoTopo} title={p.sempreNoTopo ? 'Sempre no topo: ligado' : 'Sempre no topo: desligado'} onClick={() => void api.topo(id, !p.sempreNoTopo)}>
          <Icone d={ICONES.alfinete} style={p.sempreNoTopo ? { fill: 'currentColor' } : undefined} />
        </button>
        <button type="button" className="icone botao-menu" aria-haspopup="menu" aria-expanded={menu} title="Opções do post-it" onClick={() => { setMenu((v) => !v); setConfirmaExcluir(false); }}>
          <Icone d={ICONES.menu} strokeWidth="3" />
        </button>
        <button type="button" className="icone" title="Ocultar (volta pela bandeja do sistema)" onClick={() => void api.ocultar(id)}>
          <Icone d={ICONES.fechar} />
        </button>
      </header>

      {menu && (
        <div className="menu" role="menu">
          <div className="menu-titulo">Cor</div>
          <div className="cores" role="group" aria-label="Cor do post-it">
            {CORES.map((c) => (
              <button key={c} type="button" className="cor" data-cor={c} aria-label={ROTULO_COR[c]} aria-pressed={c === p.cor} title={ROTULO_COR[c]} onClick={() => trocarCor(c)} />
            ))}
          </div>
          <button type="button" role="menuitem" className="item" onClick={() => { setMenu(false); setDialogoInstrucoes(true); }}>
            Instruções deste post-it…
          </button>
          <label className="item marcar">
            <input type="checkbox" checked={p.acessoGoogle} onChange={(e) => void api.acessoGoogle(id, e.target.checked)} />
            <span>Pode ler e-mail e agenda <small>(somente leitura)</small></span>
          </label>
          <button type="button" role="menuitem" className={`item perigo${confirmaExcluir ? ' confirmando' : ''}`}
            onClick={() => { if (confirmaExcluir) void api.excluir(id); else setConfirmaExcluir(true); }}>
            {confirmaExcluir ? 'Confirmar: apagar post-it e conversa' : 'Excluir post-it'}
          </button>
        </div>
      )}

      <div className="conversa" ref={conversaRef}
        onScroll={(e) => { const el = e.currentTarget; colarNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
        aria-live="polite">
        {msgs.length === 0 && !executando && (
          <p className="vazio">Converse com o Claude aqui. A conversa fica guardada e continua do ponto onde parou, mesmo depois de reiniciar o Windows.</p>
        )}
        {msgs.map((m, i) => <Bolha key={`${m.em}-${i}`} m={m} />)}
        {executando && (
          <div className="msg claude escrevendo" aria-busy="true">
            {fluxo ? <Formatado texto={fluxo} /> : <span className="pontinhos" aria-label="O Claude está pensando"><i /><i /><i /></span>}
          </div>
        )}
      </div>

      {erro && <div className="erro-linha" role="alert">{erro}</div>}

      <footer className="compositor">
        <textarea ref={campoRef} value={texto} rows={2} maxLength={LIMITE_MENSAGEM} placeholder="Escreva para o Claude…  (Enter envia, Shift+Enter quebra a linha)"
          aria-label="Mensagem para o Claude" onChange={(e) => setTexto(e.target.value)} onKeyDown={aoTeclar} />
        {executando
          ? <button type="button" className="enviar parar" onClick={() => void api.parar(id)}>Parar</button>
          : <button type="button" className="enviar" disabled={!texto.trim()} onClick={() => void enviar()}>Enviar</button>}
      </footer>

      {dialogoInstrucoes && (
        <DialogoInstrucoes inicial={p.instrucoes} aoFechar={() => setDialogoInstrucoes(false)} aoSalvar={async (t) => { const r = await api.instrucoes(id, t); return r.ok ? null : r.erro; }} />
      )}
    </div>
  );
}

function DialogoInstrucoes({ inicial, aoFechar, aoSalvar }: { inicial: string; aoFechar: () => void; aoSalvar: (t: string) => Promise<string | null> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [t, setT] = useState(inicial);
  const [erro, setErro] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="dialogo" onClose={aoFechar} aria-labelledby="titulo-instrucoes">
      <form onSubmit={(e) => { e.preventDefault(); void aoSalvar(t).then((m) => { if (m) setErro(m); else ref.current?.close(); }); }}>
        <h2 id="titulo-instrucoes">Instruções deste post-it</h2>
        <p className="dica">Como o Claude deve se comportar aqui (tom, foco, formato). Valem a partir da próxima mensagem.</p>
        <textarea autoFocus value={t} rows={7} maxLength={LIMITE_INSTRUCOES} onChange={(e) => setT(e.target.value)}
          placeholder="Ex.: Responda em até 3 tópicos. Foque no Projeto X." aria-label="Instruções" />
        <div className="contador">{t.length}/{LIMITE_INSTRUCOES}</div>
        {erro && <div className="erro-linha" role="alert">{erro}</div>}
        <div className="dialogo-acoes">
          <span className="espaco" />
          <button type="button" className="secundario" onClick={() => ref.current?.close()}>Cancelar</button>
          <button type="submit" className="enviar">Salvar</button>
        </div>
      </form>
    </dialog>
  );
}
