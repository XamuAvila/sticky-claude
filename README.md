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
| M4 Inicialização automática + instalador | **Pronto** (instalado e verificado no seu Windows; o único item não verificado é o reinício físico, veja "Roteiro de aceite") |
| M5 Pílula no topo da tela | **Pronto** |

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

## Roteiro de aceite

Executado no app **instalado**, com os seus dados e o Claude **reais** (`node scripts/aceite-instalado.mjs`):

| # | Item | Resultado |
|---|---|---|
| 1 | Reiniciar o Windows e o app abrir sozinho | **Parcial.** Não foi feito um reinício de verdade (você preferiu pular). Provado: a entrada `com.samuc.stickyclaude` existe em `HKCU\...\Run` com `"<exe instalado>" --autostart`; executando **exatamente esse comando** (como o Explorer faz no login) o app abre com `autostart=true`, mostra o painel, reabre os post-its e roda o briefing do início. Não foi provado: o Windows disparar a entrada no boot real e a espera da rede com o PC acabando de ligar (a espera tem teste automatizado, com a rede "subindo" aos poucos). |
| 2 | O briefing aparece com agenda e e-mails reais | **Sim.** Agenda (44 itens), e-mails e foco em 43 s, sem erro, no app instalado. |
| 3 | O post-it retoma a mesma conversa depois de reiniciar | **Sim, reiniciando o app** (fechar e abrir de novo, mesma posição, mesmo tamanho, mesmo session id, o Claude lembrou a palavra-teste). **Não** com um reinício físico do Windows, mas a sessão fica em arquivo no disco (`~\.claude\projects`) e nada disso depende do boot. Usei um post-it de teste, que foi apagado depois, para não encher o seu "Metas". |
| 4 | Fechar um post-it não encerra a sessão | **Sim.** O X ocultou, a sessão e o histórico no Claude permaneceram, e ao mostrar de novo a mesma conversa continuou (o Claude lembrou a palavra). |
| 5 | Desligar a inicialização automática remove a entrada de verdade | **Sim.** Ligar pelo interruptor (com a confirmação) criou a entrada; desligar a removeu (`reg query` não a encontrou); religar a recriou sem perguntar de novo. As entradas de Opera, Docker, Steam e Edge não foram tocadas em nenhum momento. |

## Pílula no topo da tela (M5)

Uma **pílula escura, no centro do topo da tela principal** (estilo Dynamic Island), mostra o que importa agora. A referência de UX é a ideia do mod "Dynamic Island for Windows" do Windhawk (MIT); **nenhum código dele foi copiado**.

Ordem do que ela mostra:
1. um evento começando em **até 10 min** (ponto vermelho piscando: "Em 8 min · Ligação");
2. um evento **em andamento** ("Agora · Deep Work · até 10:00");
3. o próximo evento em **até 2 h** ("Em 45 min · Planejamento");
4. a **meta do dia** (a mais atrasada, depois a mais parada, depois a de prazo mais próximo), com o próximo passo;
5. um evento mais tarde **hoje**.

Sem nada disso, a pílula nem aparece. Eventos que atravessam a meia-noite contam (um evento às 00:15 visto às 23:50 é "Em 25 min").

- **Passe o mouse** para expandir (agenda das próximas horas e a meta do dia); **clique** para abrir o painel.
- A janela é transparente e **deixa o mouse atravessar**: só captura o ponteiro enquanto ele está sobre a própria pílula. Não tira o foco de quem está digitando e não aparece na barra de tarefas.
- **Não gasta assinatura:** usa só o briefing em cache e as metas locais, recalculando a cada 30 s para o "em 12 min" andar sozinho.
- Liga e desliga em **Configurações > Pílula no topo da tela** ou no menu da bandeja (a escolha fica gravada). **Ctrl+Alt+B** esconde e devolve a pílula junto com o painel e os post-its, sem mudar a sua escolha.
- Fica na tela principal, centralizada na área útil, e se reposiciona se os monitores mudarem.

## Instalar, usar e desinstalar (M4)

Gerar os pacotes (a partir do código): `npm run dist`. Saem em `release\`:

| Arquivo | O que é |
|---|---|
| `Sticky-Claude-Instalador-0.1.0.exe` | Instalador **por usuário, sem administrador** (instala em `%LOCALAPPDATA%\Programs\Sticky Claude`, atalho no Menu Iniciar). **Recomendado.** |
| `Sticky-Claude-Portatil-0.1.0.exe` | Um arquivo só, sem instalar. Abre mais devagar (~20 s), porque se extrai numa pasta temporária a cada abertura. |

Os pacotes **não são assinados** (uso pessoal): o Windows SmartScreen pode avisar "Editor desconhecido". Clique em **Mais informações > Executar assim mesmo**.

**Instalar:** execute o instalador e siga as telas. Para atualizar, instale a versão nova por cima (seus dados ficam intactos).

**Iniciar com o Windows:** no painel, cartão **Configurações > Iniciar com o Windows**.
- Na **primeira vez** o app pergunta antes de criar qualquer coisa e mostra exatamente o que fará.
- A única alteração no sistema é **uma entrada em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`** (só o seu usuário, sem administrador), com o nome `com.samuc.stickyclaude` e o valor `"<caminho do .exe>" --autostart`. Para conferir: `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- **Desligar o interruptor remove a entrada de verdade** (o app relê o registro para ter certeza e avisa se não conseguiu). A entrada também aparece em Configurações do Windows > Aplicativos > Inicialização; se você a desativar por lá, o painel avisa.
- Ao iniciar pelo login o app espera a rede subir (até ~2 minutos), roda o briefing, mostra o painel e reabre os post-its.
- Rodando a partir do código, o interruptor fica desabilitado (a entrada apontaria para o Electron de desenvolvimento).
- No **portátil**, a entrada aponta para o `.exe` que você abriu (se você mover o arquivo, desligue e ligue de novo).

**Desinstalar:**
1. Instalado: Configurações do Windows > Aplicativos > Aplicativos instalados > **Sticky Claude** > Desinstalar. O desinstalador remove também a entrada de inicialização.
2. Portátil: desligue **Iniciar com o Windows** no painel (isso remove a entrada), saia pela bandeja e apague o `.exe`.
3. Os seus dados **não são apagados** pela desinstalação: `%APPDATA%\StickyClaude\` (metas, post-its, conversas). Apague a pasta se quiser limpar tudo.
4. As sessões dos post-its ficam no histórico do Claude Code (`~\.claude\projects\…StickyClaude-workspace`). Para apagá-las: `claude purge "%APPDATA%\StickyClaude\workspace"`.

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
npm test                  # 229 testes unitários (parser, agenda, metas, post-its, geometria, inicialização, pílula, política de ferramentas, serviços, rede, armazenamento)
npm run typecheck
npm run build; npm run test:e2e   # 30 testes E2E no app real (cliques, digitação, reinício do app, pílula), com dados temporários e sem gastar assinatura
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
.\scripts\verificar-interacao.ps1   # bandeja, atalho Ctrl+Alt+B (painel, post-its e pílula), "X só oculta", instância única
.\scripts\capturar-estados.ps1      # capturas do painel: tema claro/escuro, sem internet, aguardando rede, metas, editor e proposta
node scripts/capturar-postits.mjs   # capturas das janelas dos post-its: conversa, menu, instruções, cores
node scripts/capturar-pilula.mjs    # capturas da pílula: compacta e expandida (em breve, urgente, agora, meta atrasada)
```

Verificação dos **pacotes** (precisa de `npm run dist`); nenhuma instala nada nem liga a inicialização automática:

```powershell
node scripts/verificar-pacote.mjs      # app empacotado (release\win-unpacked) com o Claude REAL: briefing, post-it, interruptor e registro intacto
.\scripts\verificar-portatil.ps1       # versão portátil, com briefing em cache (não gasta assinatura): abre, loga, cria o post-it
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
- **Sem admin** e nenhuma alteração de configuração do sistema além da entrada de inicialização (só do seu usuário, só com a sua confirmação, e removida ao desligar). Um teste (`tests/seguranca.test.ts`) garante que só `src/main/autoinicio.ts` mexe nisso e que nenhum arquivo edita o registro por conta própria.

## Onde ficam os dados

`%APPDATA%\StickyClaude\`: `briefing.json` (cache), `metas.json` (suas metas), `backups\` (cópias das metas), `postits.json` (post-its: sessão, cor, instruções, posição e monitor), `conversas\` (cópia local do texto de cada conversa), `preferencias.json` (escolhas do app: confirmação da inicialização, pílula), `servidores.json` (conectores já vistos), `config.json` (opcional: `claudePath`, `metasParadaDias`, `modeloPostits`, `esforcoPostits`), `logs\`, `workspace\` (pasta de trabalho do Claude: as sessões dos post-its são indexadas por ela).

## Desinstalar

No M1 não há instalação: basta fechar o app (menu da bandeja → **Sair**) e apagar a pasta do projeto e `%APPDATA%\StickyClaude\`. O instalador e a remoção da inicialização automática chegam no M4.

## Estrutura

```
src/main/        processo principal: bandeja, atalho, janelas, briefing (parser, serviço, executor), metas (armazenamento, propostas),
                 post-its (estado, geometria, janelas, conversa, executor), pílula (janela e serviço), inicialização automática, política do Claude
src/preload/     ponte segura entre o processo principal e as telas
src/renderer/    telas (React): painel, post-it e pílula
src/shared/      tipos e a lógica da agenda, usados pelos dois lados
tests/           testes unitários + integração real opcional
scripts/         ícones e verificações no app real
spike/           experimentos do M0 e seus resultados
```
