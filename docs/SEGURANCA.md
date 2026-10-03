# Segurança e privacidade

Como o Sticky Claude lida com os seus e-mails, a sua agenda e o seu sistema. Para vulnerabilidades, veja ao final como reportar.

## Resumo

- **Gmail e Google Calendar são somente leitura.** Não existe caminho no código para enviar, responder, arquivar, apagar ou alterar eventos.
- **Sem chave de API, sem credenciais.** O app usa o `claude.exe` que já está logado no seu PC. Ele nunca lê `~\.claude\.credentials.json` e remove `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` do ambiente do processo filho.
- **Sem telemetria e sem servidor próprio.** A única atividade de rede do app é uma consulta de DNS para saber se a internet voltou.
- **E-mails e convites são dados, não instruções.**
- **Sem administrador** e nenhuma mudança no sistema além da entrada de inicialização, só do seu usuário, só com a sua confirmação.

## Leitura somente, em 4 camadas

O conector Gmail/Calendar do claude.ai expõe também ferramentas de escrita (`send_message`, `reply`, `create_event`, `delete_event`…). Por isso a leitura somente é imposta **pelo app**, em camadas (`src/main/claude/policy.ts`):

1. **Lista de permissão.** Só 7 ferramentas de leitura são liberadas (`--allowedTools`): `search_threads`, `get_thread` e `get_message` do Gmail; `list_events`, `get_event`, `list_calendars` e `search_events` do Calendar. Nenhuma ferramenta nativa (`--tools ""`: sem Bash, sem Edit, sem WebFetch), e tudo que não está na lista é negado (`--permission-mode dontAsk`).
2. **Lista de negação.** As escritas conhecidas dos conectores são negadas pelo nome, e cada conector ganha um curinga (`mcp__<servidor>__*`) para as ferramentas que ainda não existem.
3. **Guarda no stream.** O app lê a saída do Claude em tempo real. Se aparecer um pedido de ferramenta `mcp__…` fora da lista, ou uma ferramenta existente mas não permitida, ele **encerra a execução** na hora.
4. **Teste estático.** `tests/seguranca.test.ts` falha se qualquer arquivo, além de `policy.ts`, citar ferramentas de escrita.

Nos post-its, o acesso a e-mail e agenda vem **desligado**. Desligado, o Claude daquele post-it não tem nenhuma ferramenta. Ligado, vale a mesma política acima.

> **Limite honesto:** os conectores no claude.ai podem ter escopos de escrita já concedidos ao Google. O app não consegue reduzi-los. A proteção é a política acima, não a falta de permissão no Google. Se isso incomoda, revise as permissões do conector em claude.ai.

## Injeção de prompt (e-mails que dão ordens)

O conteúdo de e-mails e convites é **dado**. O Claude é instruído a ignorar ordens dentro dele, e o resultado inclui o campo de **conteúdo suspeito** (remetente, trecho, motivo), que o painel mostra num aviso. Mesmo que o Claude fosse enganado, ele não tem ferramenta de rede nem de escrita: o pior caso é um texto enganoso, sem exfiltração e sem ação.

**Metas.** O Claude **não** tem poder de escrita sobre `metas.json`. Para propor mudanças ele responde com um bloco `metas-patch` (JSON). O app valida, mostra **o que vai mudar** e só aplica depois do seu **Aplicar** (o foco inicial fica em **Descartar**). Só existem 3 operações: criar, atualizar campos e registrar avanço. Excluir só pela tela. Uma instrução maliciosa dentro de um e-mail não consegue alterar as suas metas em silêncio.

## Dados e privacidade

- Tudo fica em `%APPDATA%\StickyClaude\` (veja [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md#onde-ficam-os-dados-do-app)).
- **O que o Claude lê é processado pelo Claude.** E-mails, agenda e conversas passam pelo Claude Code da sua conta, nos termos da sua conta Anthropic. O app não envia nada a mais ninguém.
- **Briefing sem transcrição.** Usa `--no-session-persistence`, então o conteúdo dos e-mails não é gravado em `~\.claude\projects`.
- **Post-its precisam da sessão gravada** para retomar a conversa (`--resume`). Excluir um post-it **não** apaga a sessão do histórico do Claude Code; para isso use `claude purge "%APPDATA%\StickyClaude\workspace"`.
- **Logs só com metadados** (fonte, tempo, tokens). Texto longo é descartado e nenhum texto de conversa chega ao log (`logs\app.log`).
- **Nenhum `claude.exe` órfão.** Ao sair do app, os processos do Claude em andamento são encerrados.
- Escritas em disco são **atômicas**, com backup datado antes de excluir metas ou aplicar uma proposta.

## Inicialização automática

- A única alteração no sistema é **uma entrada em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`**, com o nome `com.samuc.stickyclaude` e o valor `"<caminho do .exe>" --autostart`. Só o seu usuário, sem administrador.
- Só é criada pelo **interruptor da interface**, e **na primeira vez o app pergunta** antes, mostrando exatamente o que fará.
- Desligar **remove a entrada de verdade**: o app relê o registro para ter certeza e avisa se não conseguiu.
- `tests/seguranca.test.ts` garante que **só `src/main/autoinicio.ts`** mexe nisso.
- A desinstalação remove a entrada, mas **preserva os seus dados**.

Para conferir: `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

## Pacotes sem assinatura

Os `.exe` **não são assinados** (não há certificado de assinatura de código). O Windows SmartScreen pode avisar "Editor desconhecido". Se preferir não confiar num binário, **construa a partir do código** ([DESENVOLVIMENTO.md](DESENVOLVIMENTO.md)).

## Reportar uma vulnerabilidade

Prefira **não abrir uma issue pública** com detalhes de exploração. Use o recurso de relato privado de vulnerabilidades do GitHub (aba **Security** do repositório, **Report a vulnerability**), se estiver disponível, ou abra uma issue pedindo um canal privado, sem detalhes técnicos. É um projeto pessoal, mantido sem prazo garantido de resposta.
