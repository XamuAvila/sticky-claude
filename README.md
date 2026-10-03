<div align="center">

# Sticky Claude

**Post-its com o Claude e um briefing do seu dia, direto na bandeja do Windows 11.**

Cada post-it é uma conversa persistente com o Claude. Ao ligar o PC, o painel mostra a sua agenda, os e-mails que pedem ação e as suas metas.

[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-2ea44f)](LICENSE)
![Windows 11](https://img.shields.io/badge/Windows-11-0078D4?logo=windows11&logoColor=white)
![Electron 44](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Testes](https://img.shields.io/badge/testes-230%20unit%C3%A1rios%20%2B%2030%20E2E-brightgreen)
![Gmail e Calendar: somente leitura](https://img.shields.io/badge/Gmail%20e%20Calendar-somente%20leitura-informational)

<img src="docs/imagens/hero.png" alt="O Sticky Claude no desktop: pílula no topo, três post-its e o painel do briefing" width="100%">

<sub>Todas as imagens deste repositório usam <b>dados fictícios</b>.</sub>

[Instalação](#instalação) · [Primeiros passos](#primeiros-passos) · [Como funciona](#como-funciona) · [Privacidade e segurança](#privacidade-e-segurança) · [FAQ](#faq-e-solução-de-problemas) · [Desenvolvimento](#desenvolvimento-e-contribuição)

</div>

---

## Sobre

O Sticky Claude é um app de bandeja para Windows 11 que junta quatro coisas:

- **Briefing de início:** agenda de hoje (com conflitos), e-mails que pedem ação (sem newsletters) e um foco sugerido de até 3 prioridades.
- **Metas:** uma lista local, com prazo, próximo passo e aviso de meta atrasada ou parada. O Claude pode **propor** mudanças, e nada muda sem o seu "Aplicar".
- **Post-its:** janelas pequenas, sempre à vista, em que cada uma é **uma sessão do Claude**. Fechar não encerra nada: ao reabrir, é a mesma conversa, no mesmo lugar e no mesmo monitor.
- **Pílula no topo da tela:** o próximo evento ou a meta do dia, estilo "Dynamic Island".

### Usa a sua assinatura, não é um agente

O app é só uma interface sobre o **`claude.exe` (Claude Code) que já está instalado e logado no seu PC**. Ele **não** usa chave de API, **não** usa o Agent SDK, **não** embute credenciais nem oferece login: cada pessoa roda o app com o **próprio** Claude Code, na **própria** conta. O que o Claude pode fazer é limitado por uma política de **somente leitura** (veja [Privacidade e segurança](#privacidade-e-segurança)).

## Veja como é

### Briefing e metas

<table>
  <tr>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/imagens/painel-briefing-escuro.png">
        <img src="docs/imagens/painel-briefing-claro.png" alt="Painel com a agenda de hoje, um conflito de horário, e-mails que pedem ação e um aviso de conteúdo suspeito" width="380">
      </picture>
      <br><sub><b>Hoje</b> e <b>E-mails que pedem ação</b>, com conflitos de agenda e aviso de conteúdo suspeito</sub>
    </td>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/imagens/painel-metas-escuro.png">
        <img src="docs/imagens/painel-metas-claro.png" alt="Painel com as metas (uma atrasada, uma parada) e o foco sugerido" width="380">
      </picture>
      <br><sub><b>Metas</b> com atraso e parada avisados, e o <b>Foco sugerido</b></sub>
    </td>
  </tr>
</table>

### Post-its

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/imagens/postits-escuro.png">
  <img src="docs/imagens/postits-claro.png" alt="Três post-its coloridos com conversas diferentes com o Claude" width="100%">
</picture>

Cada post-it tem cor, nome, instruções próprias e a sua conversa. Todos se escondem e voltam com um **Ctrl+Alt+B**.

### Pílula no topo da tela

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/imagens/pilula-escuro.png">
  <img src="docs/imagens/pilula-claro.png" alt="A pílula compacta (evento em andamento) e expandida (agenda das próximas horas e meta do dia)" width="100%">
</picture>

### Metas pela conversa, com a sua confirmação, e configurações

<table>
  <tr>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/imagens/proposta-escuro.png">
        <img src="docs/imagens/proposta-claro.png" alt="Diálogo 'Alterar suas metas?' listando o que vai mudar, com os botões Descartar e Aplicar" width="400">
      </picture>
      <br><sub>O Claude <b>propõe</b>; você confere e aplica</sub>
    </td>
    <td width="50%" align="center">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="docs/imagens/painel-config-escuro.png">
        <img src="docs/imagens/painel-config-claro.png" alt="Lista de post-its e o cartão de configurações com os interruptores de inicialização e pílula" width="400">
      </picture>
      <br><sub>Post-its e <b>Configurações</b></sub>
    </td>
  </tr>
</table>

## Funcionalidades

- **Bandeja e atalho global.** Clique no ícone para mostrar o painel; botão direito abre o menu. **Ctrl+Alt+B** esconde ou devolve painel, post-its e pílula de uma vez, sem mudar as suas preferências.
- **O X só oculta.** Painel e post-its nunca "fecham": só **Sair** (bandeja) encerra o app, e só **Excluir post-it** apaga um post-it.
- **Briefing com estados independentes.** Se o Gmail falhar, a agenda e as metas continuam aparecendo. O último briefing fica em cache e o app abre na hora.
- **Gasta pouco da assinatura.** O briefing roda **só ao iniciar o app** (e só se o cache tiver 20 min ou mais, ou estiver incompleto) e quando você clica em **Atualizar**. Nunca em loop. Metas, prazos e a pílula são calculados localmente.
- **Espera a rede.** No login, aguarda a internet subir por até ~2 minutos. Sem internet, mostra um estado claro e mantém o último briefing.
- **Metas** com nome, status (ativa, pausada, concluída, abandonada), prazo, por quê, próximo passo e último avanço. Edite pelo painel ou direto em `metas.json`: o painel acompanha sem reiniciar. Escrita atômica, com backup datado.
- **Post-its persistentes.** Um **session id próprio** por post-it, resposta em streaming com botão **Parar**, 6 cores (claro e escuro), renomear com um clique, **sempre no topo** (alfinete) e **instruções próprias**. Posição, tamanho e monitor são restaurados, inclusive com vários monitores e DPIs diferentes.
- **E-mail e agenda por post-it**, **desligados por padrão** (menu ⋯). Desligado, o Claude daquele post-it não tem nenhuma ferramenta.
- **Recuperação de sessão.** Se o histórico do Claude se perder (por exemplo, limpeza de sessões antigas), o post-it abre uma sessão nova **no mesmo lugar** e recomeça com um resumo da cópia local, avisando na conversa.
- **Tema claro e escuro** seguem o Windows.
- **Iniciar com o Windows**, opcional, com confirmação na primeira vez e remoção de verdade ao desligar.

## Requisitos

- **Windows 11.**
- **Claude Code** instalado e logado com a sua conta: `claude auth status` deve mostrar `authMethod: claude.ai`. O app procura `C:\Users\<você>\.local\bin\claude.exe` e depois o PATH.
- Conectores **Gmail** e **Google Calendar** conectados em claude.ai (confira com `claude mcp list`). Sem eles, os post-its e as metas funcionam, mas o briefing não terá agenda nem e-mails.
- Node.js 20 ou mais novo, **apenas** para rodar ou empacotar a partir do código.

## Instalação

> Ainda **não há versão publicada** na aba *Releases*. Gere o instalador a partir do código (abaixo) ou rode direto do código.

### Instalador (recomendado)

```powershell
git clone https://github.com/XamuAvila/sticky-claude.git
cd sticky-claude
npm install
npm run dist
```

Saem em `release\`:

| Arquivo | O que é |
|---|---|
| `Sticky-Claude-Instalador-0.1.0.exe` | Instalador **por usuário, sem administrador** (instala em `%LOCALAPPDATA%\Programs\Sticky Claude`, com atalho no Menu Iniciar). **Recomendado.** |
| `Sticky-Claude-Portatil-0.1.0.exe` | Um arquivo só, sem instalar. Abre mais devagar (~20 s), porque se extrai numa pasta temporária a cada abertura. |

Para **atualizar**, instale a versão nova por cima: seus dados e a inicialização automática ficam como estavam.

> Os pacotes **não são assinados**: o Windows SmartScreen pode avisar "Editor desconhecido". Clique em **Mais informações > Executar assim mesmo**. Como você gera o pacote a partir do código, também pode conferir o que está sendo empacotado.

### Rodar direto do código

```powershell
git clone https://github.com/XamuAvila/sticky-claude.git
cd sticky-claude
npm install
node node_modules\electron\install.js   # baixa o binário do Electron (o Electron 44 não faz isso sozinho)
npm run build
npx electron .                           # ou: npm run dev
```

### Desinstalar

1. **Instalado:** Configurações do Windows > Aplicativos > Aplicativos instalados > **Sticky Claude** > Desinstalar. O desinstalador remove também a entrada de inicialização.
2. **Portátil:** desligue **Iniciar com o Windows** no painel (isso remove a entrada), saia pela bandeja e apague o `.exe`.
3. **Seus dados não são apagados** pela desinstalação: `%APPDATA%\StickyClaude\` (metas, post-its, conversas). Apague a pasta se quiser limpar tudo.
4. As sessões dos post-its ficam no histórico do Claude Code. Para apagá-las: `claude purge "%APPDATA%\StickyClaude\workspace"`.

## Primeiros passos

1. Abra o **Sticky Claude**. Ele aparece na **bandeja do sistema** (perto do relógio) e abre o painel. Na primeira execução já cria o post-it **Metas**.
2. Espere o primeiro briefing (cerca de 1 minuto) ou clique em **Atualizar**.
3. Crie as suas metas (**+ Nova meta**) ou peça no post-it **Metas**: "crie a meta ...". O Claude propõe e você aplica.
4. Crie outros post-its pelo cartão **Post-its**. Dê um nome, uma cor e, se quiser, instruções (por exemplo, "responda em tópicos curtos").
5. (Opcional) Ligue **Configurações > Iniciar com o Windows**. O app mostra exatamente o que vai fazer antes de criar a entrada.
6. (Opcional) Ligue ou desligue a **Pílula no topo da tela** em **Configurações** ou no menu da bandeja.

**Atalhos:** **Ctrl+Alt+B** mostra ou esconde tudo. **Enter** envia a mensagem de um post-it, **Shift+Enter** quebra a linha.

## Como funciona

```mermaid
flowchart LR
  subgraph PC["Seu PC"]
    APP["Sticky Claude<br/>bandeja, painel, post-its, pílula"]
    DADOS[("Dados locais<br/>metas, post-its, cache")]
    CLI["claude.exe<br/>seu Claude Code, já logado"]
    APP <--> DADOS
    APP -- "claude -p, só leitura" --> CLI
  end
  CLI -- "conectores, só leitura" --> GOOGLE["Gmail e Google Calendar"]
  CLI -- "sua assinatura" --> ANTHROPIC["Anthropic"]
```

- O app chama o `claude.exe` como **processo filho** (`claude -p`, prompt pela entrada padrão, saída em `stream-json`) e mostra o resultado. Não existe camada de "agente" própria: o Claude só recebe 7 ferramentas de leitura, e nos post-its nenhuma, a menos que você ligue o acesso.
- **Cada post-it é uma sessão:** a primeira mensagem usa `--session-id`, as seguintes `--resume`. Nunca depende de "a última sessão da pasta".
- **Briefing:** Agenda e E-mails rodam em paralelo (cada um com um esquema de saída validado por `zod`), mais uma chamada curta e sem ferramentas para o Foco. Metas, prazos e "parada" são calculados no código.
- **Metas pela conversa:** o Claude devolve um bloco `metas-patch`; o app valida, mostra o que muda e só aplica com o seu OK.
- **Pílula:** usa só o briefing em cache e as metas locais (recalculado a cada 30 s) e **não gasta assinatura**.

## Privacidade e segurança

Resumo (os detalhes estão em [`docs/SEGURANCA.md`](docs/SEGURANCA.md)):

- **Gmail e Calendar são somente leitura**, imposto pelo app em 4 camadas: só 7 ferramentas de leitura liberadas, lista de negação para as escritas, uma guarda que derruba a execução se o Claude pedir qualquer outra ferramenta, e um teste que impede o código de citar ferramentas de escrita.
- **E-mails e convites são dados, não instruções.** Tentativas de dar ordens ao Claude aparecem num aviso de "Conteúdo suspeito" e não são obedecidas.
- **Sem chave de API e sem credenciais.** O app remove `ANTHROPIC_API_KEY` e `ANTHROPIC_AUTH_TOKEN` do ambiente do `claude.exe` e nunca lê o arquivo de credenciais.
- **Sem telemetria e sem servidor próprio.** A única atividade de rede do app é uma consulta de DNS para saber se a internet voltou. Os dados ficam em `%APPDATA%\StickyClaude\`.
- **Sem administrador.** A única alteração no sistema é **uma entrada de inicialização no seu usuário**, criada só com a sua confirmação e removida ao desligar.

> **Limites honestos.** (1) O que o Claude lê (e-mails, agenda, conversas) é **processado pelo Claude**, nos termos da sua conta Anthropic. (2) Os conectores no claude.ai podem ter escopos de escrita já concedidos ao Google, e o app não consegue reduzi-los: a proteção é a política do app.

## Configuração

Opcional. Crie `%APPDATA%\StickyClaude\config.json` (todos os campos são opcionais):

| Campo | Padrão | O que faz |
|---|---|---|
| `claudePath` | procura em `~\.local\bin` e no PATH | caminho do `claude.exe`, se estiver em outro lugar |
| `metasParadaDias` | `7` | dias sem avanço para uma meta ativa ser avisada como **parada** |
| `modeloPostits` | `sonnet` | modelo das conversas dos post-its |
| `esforcoPostits` | `medium` | `low`, `medium` ou `high` |

```json
{ "claudePath": "C:\\caminho\\claude.exe", "metasParadaDias": 5 }
```

Onde ficam os dados: [`docs/DESENVOLVIMENTO.md`](docs/DESENVOLVIMENTO.md#onde-ficam-os-dados-do-app).

## FAQ e solução de problemas

**O Windows avisou "Editor desconhecido" (SmartScreen).**
Os pacotes não são assinados. Clique em **Mais informações > Executar assim mesmo**.

**"Claude não encontrado" ou o briefing dá erro logo de cara.**
Confirme que `claude auth status` mostra `authMethod: claude.ai`. Se o `claude.exe` está fora de `~\.local\bin` e do PATH, aponte-o em `config.json` (`claudePath`).

**O briefing vem sem agenda ou sem e-mails.**
Os conectores Gmail e Google Calendar precisam estar conectados em claude.ai (`claude mcp list`). Cada fonte tem estado próprio: se uma falhar, as outras aparecem.

**Quanto isso gasta da minha assinatura?**
O briefing faz 3 chamadas (Agenda, E-mails e Foco) **ao iniciar o app** e ao clicar em **Atualizar**; cada mensagem num post-it é uma chamada. A pílula, as metas e os avisos de prazo não gastam nada. Os limites de uso são os da sua conta do Claude.

**Posso usar com chave de API?**
Não, de propósito: o app foi feito para usar a sua assinatura pelo Claude Code que você já tem.

**Um post-it sumiu.**
O **X só oculta**. Abra a bandeja do sistema (cada post-it aparece no menu, com uma caixa de marcação) ou o cartão **Post-its** do painel. **Ctrl+Alt+B** também esconde e devolve tudo.

**O app abre sem internet?**
Sim: mostra o último briefing em cache e um aviso. Com o login do Windows, ele espera a rede subir por até ~2 minutos antes de rodar o briefing.

**Como desligo a inicialização automática?**
**Configurações > Iniciar com o Windows**. O app relê o registro para ter certeza de que a entrada foi removida. Ela também aparece em Configurações do Windows > Aplicativos > Inicialização.

**Funciona em macOS ou Linux?**
Não foi feito nem testado para eles. O projeto é para Windows 11.

## Estado do projeto

Versão **0.1.0**. Os marcos planejados estão prontos: spike do Claude (M0), bandeja e briefing (M1), metas (M2), post-its persistentes (M3), inicialização automática e instalador (M4) e pílula (M5). A verificação, o que foi provado e **o que não foi** (reinício físico do Windows, vários monitores ao vivo) estão em [`docs/ACEITE.md`](docs/ACEITE.md).

## Desenvolvimento e contribuição

```powershell
npm test                          # 230 testes unitários
npm run typecheck
npm run build; npm run test:e2e   # 30 testes E2E no app real, sem gastar assinatura
```

O guia completo (estrutura do código, testes reais, verificações, variáveis de ambiente, empacotamento) está em [`docs/DESENVOLVIMENTO.md`](docs/DESENVOLVIMENTO.md).

Contribuições são bem-vindas: abra uma *issue* para conversar antes de mudanças grandes. Ao enviar um *pull request*:

- rode `npm test`, `npm run typecheck` e, se mexeu na interface, `npm run test:e2e`;
- **não enfraqueça a política de somente leitura** (`src/main/claude/policy.ts`) nem cite ferramentas de escrita fora dela: `tests/seguranca.test.ts` vai falhar;
- **não inclua dados reais** (e-mails, agenda, caminhos do seu usuário). Testes e imagens usam dados inventados.

## Licença e avisos

Distribuído sob a licença [MIT](LICENSE): use, modifique e distribua à vontade, mantendo o aviso de copyright, **sem garantias**.

Projeto pessoal e independente. **Não é um produto da Anthropic** e não tem relação oficial com ela. "Claude" e "Claude Code" são marcas da Anthropic. A ideia da pílula é inspirada no mod "Dynamic Island for Windows" do Windhawk (MIT); **nenhum código dele foi copiado**.
