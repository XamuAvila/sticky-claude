import { describe, expect, it } from 'vitest';
import {
  FERRAMENTAS_LEITURA, NEGADAS_POR_NOME, ambienteDoFilho, avaliarFerramenta, ferramentaPermitida, montarArgs, negarServidores, permitidasDoPerfil, prefixoDoServidor,
} from '../src/main/claude/policy';

const valorDe = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('FERRAMENTAS_LEITURA', () => {
  it('são exatamente 7 e todas de leitura (search/get/list)', () => {
    expect(FERRAMENTAS_LEITURA).toHaveLength(7);
    for (const t of FERRAMENTAS_LEITURA) expect(t).toMatch(/__(search|get|list)_[a-z_]+$/);
  });
  it('nenhuma permitida está na lista de negação', () => {
    for (const t of FERRAMENTAS_LEITURA) expect(NEGADAS_POR_NOME).not.toContain(t);
  });
});

describe('prefixoDoServidor / negarServidores', () => {
  it('normaliza nomes de servidor como o CLI faz', () => {
    expect(prefixoDoServidor('claude.ai Google Drive')).toBe('mcp__claude_ai_Google_Drive__');
    expect(prefixoDoServidor('plugin:figma:figma')).toBe('mcp__plugin_figma_figma__');
  });
  it('nega por servidor, nunca com curinga global, e poupa Gmail e Calendar', () => {
    const neg = negarServidores(['claude.ai Gmail', 'claude.ai Google Calendar', 'claude.ai Linear', 'claude.ai Linear']);
    expect(neg).toEqual(['mcp__claude_ai_Linear__*']);
    expect(neg).not.toContain('mcp__*');
  });
});

describe('montarArgs(leitura)', () => {
  const args = montarArgs({ perfil: 'leitura', servidoresVistos: ['claude.ai NovoConector'], schema: { type: 'object' } });

  it('desliga as ferramentas nativas e usa dontAsk', () => {
    expect(valorDe(args, '--tools')).toBe('');
    expect(valorDe(args, '--permission-mode')).toBe('dontAsk');
  });
  it('libera só as 7 de leitura', () => {
    expect(valorDe(args, '--allowedTools')!.split(',')).toEqual([...FERRAMENTAS_LEITURA]);
  });
  it('nega escrita, leitura não usada e conectores vistos (inclusive novos)', () => {
    const neg = valorDe(args, '--disallowedTools')!.split(',');
    expect(neg).toContain('mcp__claude_ai_Gmail__send_message');
    expect(neg).toContain('mcp__claude_ai_Google_Calendar__create_event');
    expect(neg).toContain('mcp__claude_ai_Linear__*');
    expect(neg).toContain('mcp__claude_ai_NovoConector__*');
    expect(neg).not.toContain('mcp__*');
  });
  it('isola de settings/skills do usuário e nunca pula permissões', () => {
    expect(valorDe(args, '--setting-sources')).toBe('');
    expect(args).toContain('--disable-slash-commands');
    expect(args.join(' ')).not.toMatch(/dangerously|bypassPermissions/);
  });
  it('envia o schema; sessão e system prompt só quando pedidos', () => {
    expect(JSON.parse(valorDe(args, '--json-schema')!)).toEqual({ type: 'object' });
    expect(args).not.toContain('--resume');
    expect(args).not.toContain('--system-prompt');
  });
});

describe('montarArgs(semFerramentas)', () => {
  const args = montarArgs({ perfil: 'semFerramentas' });
  it('não libera nada e retira também Gmail e Calendar do contexto', () => {
    expect(args).not.toContain('--allowedTools');
    const neg = valorDe(args, '--disallowedTools')!.split(',');
    expect(neg).toContain('mcp__claude_ai_Gmail__*');
    expect(neg).toContain('mcp__claude_ai_Google_Calendar__*');
  });
});

describe('persistência da transcrição', () => {
  it('o briefing não grava transcrição (ela teria o conteúdo dos e-mails); o padrão continua gravando', () => {
    expect(montarArgs({ perfil: 'leitura', semPersistencia: true })).toContain('--no-session-persistence');
    expect(montarArgs({ perfil: 'leitura' })).not.toContain('--no-session-persistence');
  });
});

describe('sessões (post-its)', () => {
  it('primeira vez usa --session-id; depois --resume; instruções com snapshot desligado', () => {
    const novo = montarArgs({ perfil: 'semFerramentas', sessao: { id: 'abc', retomar: false }, systemPrompt: 'seja breve' });
    expect(valorDe(novo, '--session-id')).toBe('abc');
    expect(novo).not.toContain('--resume');
    expect(valorDe(novo, '--system-prompt-snapshot')).toBe('off');
    const de = montarArgs({ perfil: 'semFerramentas', sessao: { id: 'abc', retomar: true } });
    expect(valorDe(de, '--resume')).toBe('abc');
    expect(de).not.toContain('--session-id');
  });
});

describe('permitidasDoPerfil', () => {
  it('leitura + StructuredOutput (interna do --json-schema); sem ferramentas: só StructuredOutput', () => {
    expect(permitidasDoPerfil('leitura', true)).toEqual([...FERRAMENTAS_LEITURA, 'StructuredOutput']);
    expect(permitidasDoPerfil('semFerramentas', true)).toEqual(['StructuredOutput']);
    expect(permitidasDoPerfil('semFerramentas', false)).toEqual([]);
  });
  it('a guarda continua barrando escrita e Bash mesmo com StructuredOutput liberada', () => {
    const ok = permitidasDoPerfil('leitura', true);
    expect(ferramentaPermitida('StructuredOutput', ok)).toBe(true);
    expect(ferramentaPermitida('mcp__claude_ai_Gmail__send_message', ok)).toBe(false);
    expect(ferramentaPermitida('Bash', ok)).toBe(false);
  });
});

describe('avaliarFerramenta (guarda do stream)', () => {
  const ok = permitidasDoPerfil('leitura', true);
  const existentes = new Set([...ok, 'mcp__claude_ai_Linear__get_issue']);

  it('permitida: leitura e StructuredOutput', () => {
    expect(avaliarFerramenta('mcp__claude_ai_Gmail__search_threads', ok, existentes)).toBe('permitida');
    expect(avaliarFerramenta('StructuredOutput', ok, existentes)).toBe('permitida');
  });
  it('qualquer mcp__ fora da lista é violação, mesmo que nem exista (sinal de injeção)', () => {
    expect(avaliarFerramenta('mcp__claude_ai_Gmail__send_message', ok, existentes)).toBe('violacao');
    expect(avaliarFerramenta('mcp__claude_ai_Linear__get_issue', ok, existentes)).toBe('violacao');
  });
  it('nativa que nem existe na execução (modelo tenta Bash) é só ignorada', () => {
    expect(avaliarFerramenta('Bash', ok, existentes)).toBe('inexistente');
    expect(avaliarFerramenta('WebFetch', ok, existentes)).toBe('inexistente');
  });
  it('nativa que EXISTE e não é permitida é violação', () => {
    expect(avaliarFerramenta('Bash', ok, new Set([...existentes, 'Bash']))).toBe('violacao');
  });
  it('sem a lista do init, o critério é o mais estrito', () => {
    expect(avaliarFerramenta('Bash', ok, null)).toBe('violacao');
  });
});

describe('guarda e ambiente', () => {
  it('ferramentaPermitida', () => {
    expect(ferramentaPermitida('mcp__claude_ai_Gmail__search_threads', FERRAMENTAS_LEITURA)).toBe(true);
    expect(ferramentaPermitida('mcp__claude_ai_Gmail__send_message', FERRAMENTAS_LEITURA)).toBe(false);
    expect(ferramentaPermitida('Bash', FERRAMENTAS_LEITURA)).toBe(false);
  });
  it('ambienteDoFilho remove chaves de API (só assinatura)', () => {
    const env = ambienteDoFilho({ PATH: 'x', ANTHROPIC_API_KEY: 'k', ANTHROPIC_AUTH_TOKEN: 't' });
    expect(env).toEqual({ PATH: 'x' });
  });
});
