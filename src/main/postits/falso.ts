// Conversa FALSA, só para desenvolvimento (STICKY_FAKE_CLAUDE=1, e nunca no app empacotado). Sem gastar assinatura.
// Imita o comportamento observado no CLI real: --resume de sessão desconhecida e --session-id repetido dão erro,
// e a resposta chega em pedaços (streaming). Guarda em disco as sessões "criadas" e cada chamada recebida, para os
// testes E2E conferirem que o app reabre a MESMA sessão depois de reiniciar.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gravarJsonAtomico } from '../storage';
import type { ExecutarConversa } from './conversa';

export interface ChamadaFalsa {
  sessionId: string;
  retomar: boolean;
  postit: string;
  instrucoes: string;
  acessoGoogle: boolean;
  /** Primeiros caracteres da mensagem recebida (para ver o prefácio de contexto). */
  mensagem: string;
  systemPrompt: string;
}

function ler<T>(arquivo: string, vazio: T): T {
  try {
    return existsSync(arquivo) ? (JSON.parse(readFileSync(arquivo, 'utf8')) as T) : vazio;
  } catch {
    return vazio;
  }
}

export function executorConversaFalso(dados: string, atrasoMs = 40): ExecutarConversa {
  const arqSessoes = join(dados, 'fake-sessoes.json');
  const arqChamadas = join(dados, 'fake-chamadas.json');

  return async (p) => {
    const sessoes = ler<Record<string, number>>(arqSessoes, {});
    const chamadas = ler<ChamadaFalsa[]>(arqChamadas, []);
    chamadas.push({
      sessionId: p.sessionId, retomar: p.retomar, postit: p.postit.nome, instrucoes: p.postit.instrucoes,
      acessoGoogle: p.postit.acessoGoogle, mensagem: p.texto.slice(0, 400), systemPrompt: p.systemPrompt,
    });
    gravarJsonAtomico(arqChamadas, chamadas);

    if (p.retomar && !(p.sessionId in sessoes)) {
      return { ok: false, erro: { tipo: 'sessao-perdida', mensagem: 'O Claude não encontrou mais essa conversa no histórico dele.' } };
    }
    if (!p.retomar && p.sessionId in sessoes) {
      return { ok: false, erro: { tipo: 'sessao-em-uso', mensagem: 'Essa sessão já existe; retomando a conversa.' } };
    }
    const n = (sessoes[p.sessionId] ?? 0) + 1;
    sessoes[p.sessionId] = n;
    gravarJsonAtomico(arqSessoes, sessoes);

    const msgAtual = p.texto.includes('Mensagem atual do usuário:\n') ? p.texto.split('Mensagem atual do usuário:\n').pop()! : p.texto;
    let resposta = `Resposta simulada ${n} de “${p.postit.nome}”. Você disse: ${msgAtual.trim().slice(0, 200)}`;
    if (p.texto.startsWith('[Contexto recuperado')) resposta += ' [CONTEXTO-RECUPERADO]';
    if (/proponha-metas/i.test(msgAtual)) {
      let id: string | undefined;
      try {
        const linha = /Metas atuais do usuário \(JSON\): (.*)$/m.exec(p.systemPrompt)?.[1];
        id = linha ? (JSON.parse(linha) as Array<{ id: string }>)[0]?.id : undefined;
      } catch { /* sem metas no prompt */ }
      const patch = { operacoes: [...(id ? [{ op: 'atualizar', id, campos: { proximoPasso: 'Escolher o primeiro passo de 15 minutos' } }] : []), { op: 'criar', meta: { nome: 'Meta sugerida no post-it', status: 'ativa' } }] };
      resposta += '\nProponho esta alteração:\n```metas-patch\n' + JSON.stringify(patch) + '\n```';
    }
    if (/proponha-invalido/i.test(msgAtual)) resposta += '\n```metas-patch\n{"operacoes":[{"op":"excluir","id":"x"}]}\n```';

    const passo = /lento/i.test(msgAtual) ? 400 : atrasoMs;
    for (let i = 0; i < resposta.length; i += 14) {
      if (p.sinal.aborted) return { ok: false, erro: { tipo: 'cancelado', mensagem: 'Interrompido.' } };
      p.aoDelta(resposta.slice(i, i + 14));
      await new Promise((r) => setTimeout(r, passo));
    }
    if (p.sinal.aborted) return { ok: false, erro: { tipo: 'cancelado', mensagem: 'Interrompido.' } };
    return { ok: true, texto: resposta };
  };
}
