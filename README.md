# Sticky Claude

App de Windows 11 que fica na bandeja do sistema e mostra, ao ligar o PC, um **briefing** com a sua agenda e os e-mails que pedem ação. A ideia seguinte (M3) são os **post-its**: janelas pequenas, sempre à vista, em que cada uma é uma conversa persistente com o Claude.

O app **usa a sua assinatura do Claude** por meio do `claude.exe` (Claude Code) que já está instalado e logado neste PC. Ele não usa chave de API, não usa o Agent SDK e não lê as suas credenciais.

> **Uso pessoal.** Não é feito para ser distribuído a outras pessoas.

## Estado atual

| Marco | Situação |
|---|---|
| M0 Spike do Claude | Concluído (`spike/RESULTADOS.md`) |
| M1 Bandeja + briefing | **Pronto** |
| M2 Metas | **Pronto** |
| M3 Post-its persistentes | **Pronto** |
| M4 Inicialização automática + instalador | Pendente |
| M5 Pílula no topo da tela | Pendente |

## O que o M1 faz

- Ícone na bandeja (clique alterna o painel; botão direito abre o menu) e atalho global **Ctrl+Alt+B** para mostrar/ocultar.
- O **X só oculta** o painel; o app continua na bandeja. Só **Sair** (menu da bandeja) encerra.
- Uma instância por vez: abrir o app de novo traz o painel de volta.
- Painel com quatro cartões, cada um com estado próprio (carregando, ok ou erro). Se o Gmail falhar, o resto aparece:
  - **Hoje**: agenda de hoje, com conflitos, o que começa nas próximas horas, e Amanhã e Depois de amanhã recolhidos.
  - **E-mails que pedem ação**: remetente, assunto e o que fazer (sem newsletters). Conteúdo que tenta dar ordens ao Claude aparece num aviso, e o app não obedece.
  - **Metas**: status, dias restantes, próximo passo, por quê e último avanço (veja "Metas" abaixo).
  - **Foco sugerido**: no máximo 3 prioridades; as metas ativas entram na escolha.
- O último briefing fica em cache. O app abre na hora e mostra "atualizado há X min".
- O briefing automático roda **só ao iniciar o app** e quando você clica em **Atualizar**, nunca em loop. Se o cache tem menos de 20 minutos e está completo, o início só mostra o cache.
- No início, espera a rede subir por até ~2 minutos. Sem internet, mostra um estado claro e mantém o último briefing.
- Tema claro e escuro seguem o Windows.

## Metas (M2)

As metas ficam em `%APPDATA%\StickyClaude\metas.json`. Cada uma tem **nome, status** (ativa, pausada, concluída ou abandonada), **prazo, por quê, próximo passo** e **último avanço**.

- Edite pelo painel (**+ Nova meta**, **Editar**, **Registrar avanço**) ou direto no arquivo: o painel acompanha as mudanças sem reiniciar.
- O painel mostra os dias restantes e avisa quando uma meta ativa está **atrasada** ou **parada** (sem avanço há 7 dias ou mais; ajuste com `metasParadaDias` em `config.json`). Esse cálculo é local e não gasta assinatura.
- A escrita é atômica, com backup datado antes de excluir ou de aplicar uma proposta do Claude (os 10 mais recentes ficam em `%APPDATA%\StickyClaude\backups\`). Se o arquivo ficar ilegível, o app guarda uma cópia (`metas.json.corrompido-…`) e recomeça vazio, nunca descarta o seu conteúdo.
- **Alterar metas por conversa com o Claude, sem dar a ele poder de escrita.** O Claude responde com um bloco `metas-patch` (JSON). O app valida, mostra **o que vai mudar** e só aplica depois do seu **Aplicar** (o foco inicial fica em **Descartar**). Só existem 3 operações: criar, atualizar campos e registrar avanço. Excluir só pela tela. Uma instrução maliciosa dentro de um e-mail não consegue alterar as suas metas em silêncio. A conversa em si chega com os post-its (M3); a fila de propostas e o diálogo já estão prontos e testados.

Formato do bloco que o Claude devolve:

````
```metas-patch
{ "operacoes": [
  { "op": "atualizar", "id": "<id da meta>", "campos": { "prazo": "2026-12-15", "proximoPasso": "Ler 10 páginas" } },
  { "op": "avanco", "id": "<id da meta>", "nota": "Terminei o capítulo 2" },
  { "op": "criar", "meta": { "nome": "Correr 5 km", "status": "ativa", "prazo": "2026-11-30" } }
] }
```
````

## Post-its (M3)

Cada **post-it é uma janela pequena, sem moldura e redimensionável, com uma conversa própria e persistente com o Claude**. Na primeira execução o app já cria o post-it **Metas**.

- **Nunca fecham.** O **X só oculta**; o post-it volta pela bandeja do sistema (cada um aparece no menu com uma caixa de marcação) ou pelo cartão "Post-its" do painel. Só **Excluir post-it** (menu **⋯** do próprio post-it, com confirmação) apaga: a janela, o estado e a cópia da conversa.
- **A mesma conversa depois de reiniciar.** Cada post-it tem o **seu session id** (guardado em `postits.json`). A primeira mensagem usa `--session-id`; as seguintes, `--resume`. Nunca depende de "a última sessão da pasta". Depois de reiniciar o Windows, o post-it reabre **no mesmo lugar, no mesmo tamanho e no mesmo monitor** e continua a mesma sessão.
- **Personalização.** Criar, **renomear** (clique no título), **cor** (6 opções, claro e escuro), **sempre no topo** (alfinete) e **instruções próprias** (menu ⋯). Editar as instruções vale já na mensagem seguinte.
- **Acesso a e-mail e agenda por post-it**, desligado por padrão (menu ⋯). Quando ligado, é a mesma política de **somente leitura** do briefing. Desligado, o Claude daquele post-it não tem nenhuma ferramenta.
- **Conversa em streaming**, com botão **Parar**. Uma resposta interrompida fica guardada como parcial.
- **Metas pela conversa.** Qualquer post-it pode propor mudanças nas metas (bloco `metas-patch`); elas só valem depois do **Aplicar** no painel (veja "Metas").
- **Se o histórico do Claude se perder** (ex.: limpeza automática de sessões antigas do Claude Code), o app percebe (`No conversation found…`), abre uma sessão nova **no mesmo post-it** e recomeça com um resumo da cópia local, avisando na conversa. Se a tentativa anterior chegou a criar a sessão (`already in use`), ele passa a retomá-la sozinho.
- **Vários monitores e DPIs.** A posição é guardada com a tela de origem (id, tamanho e escala). Ao reabrir, procura a tela pela id, depois por tamanho e escala (o Windows às vezes troca as ids) e, se o monitor sumiu, usa a principal; em todos os casos a janela é puxada para dentro da área útil (nunca fica sob a barra de tarefas). Se o monitor voltar, os post-its voltam para ele. A correção de escala fracionária (150%) mantém o tamanho estável, sem crescer 1 px a cada reinício.
- **Ctrl+Alt+B** esconde (ou devolve) o painel e todos os post-its de uma vez, sem marcar nenhum como "oculto".

> **Limite honesto:** só há 1 monitor nesta máquina. A lógica de vários monitores e DPIs mistos é coberta por testes unitários com telas simuladas (`tests/postits-geometria.test.ts`), não por teste ao vivo.

A cópia local da conversa fica em `%APPDATA%\StickyClaude\conversas\<id>.json` (até 300 mensagens). O contexto de verdade fica na sessão do Claude. Excluir um post-it não apaga a sessão do histórico do Claude Code; para isso use `claude purge`.

## Requisitos

- Windows 11.
- Claude Code instalado e logado com a sua conta (`claude auth status` deve mostrar `authMethod: claude.ai`). O app procura `C:\Users\<você>\.local\bin\claude.exe` e depois o PATH. Para usar outro caminho, crie `%APPDATA%\StickyClaude\config.json` com `{ "claudePath": "C:\\caminho\\claude.exe" }`.
- Conectores **Gmail** e **Google Calendar** conectados em claude.ai (`claude mcp list`).
- Node.js 20 ou mais novo (para rodar a partir do código).

## Como rodar (a partir do código)

```powershell
cd sticky-claude
npm install
node node_modules\electron\install.js   # baixa o binário do Electron (o Electron 44 não faz isso sozinho)
npm run build
npx electron .                           # ou: npm run dev
```

## Testes

```powershell
npm test                  # 195 testes unitários (parser, agenda, metas, post-its, geometria, política de ferramentas, serviços, rede, armazenamento)
npm run typecheck
npm run build; npm run test:e2e   # 18 testes E2E no app real (cliques, digitação, reinício do app), com dados temporários e sem gastar assinatura
```

Testes de integração **reais**, que consomem a assinatura (imprimem só contagens e resultados):

```powershell
$env:STICKY_LIVE = '1'
npx vitest run tests/integracao.live.test.ts   # briefing completo: Agenda, E-mails e Foco (3 chamadas)
npx vitest run tests/postit.live.test.ts       # post-its: mesma sessão após "reiniciar", instruções, streaming e proposta de metas (4 chamadas)
Remove-Item Env:STICKY_LIVE
```

Verificações no app real **sem gastar assinatura** (executor falso, dados sintéticos, pasta temporária):

```powershell
.\scripts\verificar-interacao.ps1   # bandeja, atalho Ctrl+Alt+B (painel e post-its), "X só oculta", instância única
.\scripts\capturar-estados.ps1      # capturas do painel: tema claro/escuro, sem internet, aguardando rede, metas, editor e proposta
node scripts/capturar-postits.mjs   # capturas das janelas dos post-its: conversa, menu, instruções, cores
```

Com `STICKY_DATA_DIR` definido (testes e verificações), o app também isola a pasta interna do Electron (`<dados>\electron`), então nunca esbarra no seu Sticky Claude de verdade.

## Segurança e privacidade

- **Gmail e Calendar são somente leitura.** Não existe caminho no código para enviar, responder, arquivar, apagar ou alterar eventos. São 4 camadas (`src/main/claude/policy.ts`):
  1. só 7 ferramentas de leitura liberadas (`--allowedTools`), nenhuma ferramenta nativa (`--tools ""`), e o que não está na lista é negado (`--permission-mode dontAsk`);
  2. lista de negação com as escritas dos conectores e curinga por servidor para os outros conectores;
  3. uma guarda no stream que derruba a execução se o Claude pedir uma ferramenta `mcp__…` fora da lista;
  4. um teste que falha se qualquer arquivo, além de `policy.ts`, citar ferramentas de escrita (`tests/seguranca.test.ts`).
- **Limite honesto:** os conectores no claude.ai podem ter escopos de escrita já concedidos ao Google. O app não consegue reduzi-los. A proteção é a política acima.
- **E-mails e convites são dados, não instruções.** O Claude é instruído a ignorar ordens dentro deles, e qualquer tentativa vai para o aviso "Conteúdo suspeito".
- **Sem chave de API.** O app remove `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` do ambiente do `claude.exe`.
- **Sem transcrição no briefing.** O briefing usa `--no-session-persistence`, então o conteúdo dos e-mails não é gravado em `~/.claude/projects`. (Os post-its **precisam** da sessão gravada para retomar a conversa; o log do app, mesmo assim, nunca recebe texto de conversa.)
- **Nenhum `claude.exe` órfão.** Ao sair do app, os processos do Claude em andamento são encerrados.
- **Sem telemetria do app.** A única atividade de rede do app é uma consulta de DNS para saber se a internet voltou. Os dados ficam em `%APPDATA%\StickyClaude\`. O log (`logs\app.log`) tem só metadados (fonte, tempo, tokens) e descarta texto longo.
- **Sem admin** e nenhuma alteração de configuração do sistema.

## Onde ficam os dados

`%APPDATA%\StickyClaude\`: `briefing.json` (cache), `metas.json` (suas metas), `backups\` (cópias das metas), `postits.json` (post-its: sessão, cor, instruções, posição e monitor), `conversas\` (cópia local do texto de cada conversa), `servidores.json` (conectores já vistos), `config.json` (opcional: `claudePath`, `metasParadaDias`, `modeloPostits`, `esforcoPostits`), `logs\`, `workspace\` (pasta de trabalho do Claude: as sessões dos post-its são indexadas por ela).

## Desinstalar

No M1 não há instalação: basta fechar o app (menu da bandeja → **Sair**) e apagar a pasta do projeto e `%APPDATA%\StickyClaude\`. O instalador e a remoção da inicialização automática chegam no M4.

## Estrutura

```
src/main/        processo principal: bandeja, atalho, janelas, briefing (parser, serviço, executor), metas (armazenamento, propostas),
                 post-its (estado, geometria, janelas, conversa, executor), política do Claude
src/preload/     ponte segura entre o processo principal e as telas
src/renderer/    telas (React): painel e post-it
src/shared/      tipos e a lógica da agenda, usados pelos dois lados
tests/           testes unitários + integração real opcional
scripts/         ícones e verificações no app real
spike/           experimentos do M0 e seus resultados
```
