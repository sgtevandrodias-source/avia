# Estado do projeto Avia

> **Última atualização:** 17/11/2026.
>
> **Para o Claude:** este arquivo é carregado em toda sessão pelo `CLAUDE.md`. Ele é a fonte da verdade sobre **em que pé o projeto está**. Sempre que uma tarefa mudar o estágio do projeto (deploy, build, migração, publicação, decisão do Evandro, pendência resolvida ou criada), **atualize as seções afetadas e a data acima no fim da tarefa**, e mostre ao Evandro o que mudou. Se algo aqui contradizer o código ou o Git, confie no código e corrija este arquivo.
>
> **Repositório público no GitHub:** nunca escreva aqui senhas, tokens, chaves, e-mails pessoais, telefones ou o caminho das pastas de chaves.

---

## 1. O que é o Avia

App de **agenda, tarefas e lembretes** em português. A pessoa fala ou digita ("reunião amanhã às 15h") e o app entende a data, o horário e a categoria sozinho. Tem também o **"Avia que alivia!"**, um espaço privado para registrar pensamentos e sentimentos.

- **Dono e desenvolvedor:** Evandro Dias, conta pessoal "EDS IDEAS FACTORY" no Google Play. Evandro **não é programador**: fale com ele em português simples e explique o passo a passo de tudo que for feito fora do VS Code.
- **Plataformas:** app Android (Google Play) e versão web (PWA) em **edsavia.com.br**.
- **Modelo de negócio:** app **pago, R$ 1,49**, sem anúncios e sem rastreamento.
- **Usuários reais:** cerca de 40 contas em produção (amigos e família). **Nunca altere dados de produção sem autorização.**

---

## 2. Estágio atual (resumo)

| Área | Situação |
|---|---|
| Código | `master` = `origin/master` (commit `5b08c1d`, versão **1.3.0**). Tudo juntado no `master`. |
| Servidor (Worker `avia-api`) | Publicado a partir do `master` em 13/11/2026. Em dia. |
| Banco (D1 `avia-db`) | Migrações até a **0022** aplicadas e registradas. Nenhuma pendente. |
| Site (Cloudflare Pages, projeto `avia`) | Publicado em 13/11/2026, com a política de privacidade atualizada (Google Agenda e transferência). |
| Build Android | AAB de produção **1.3.0 (versionCode 4)**, build EAS `4514342f`, assinado com a chave certa (SHA-1 `AC:8D…98:1B`). |
| Google Play | Faixa **"Teste fechado – Alpha"** (só Brasil): versão **4 (1.3.0) aprovada e publicada** em 13/11/2026. Lista "Testadores AVIA" com 34 e-mails. Link de convite: `https://play.google.com/apps/testing/com.avia.app` |
| Testadores | Convite enviado. Em 17/11/2026: 16 aquisições (R$ 22,40 de receita) e **12 testadores participando continuamente há 2 dias** (contagem iniciada por volta de 15/11). |
| Status de comerciante | **Declarado** (concluído pelo Evandro até 17/11/2026). |
| Produção (loja aberta) | **Ainda não.** Requisitos 1 e 2 cumpridos (versão publicada e ≥12 testadores). Falta o 3: **14 dias seguidos**, previsto para por volta de **29/11/2026**. |

### Próximos passos (em ordem)
1. ~~Religar a "Proteção automática"~~: **feito em 17/11/2026** ("Proteção boa", 1 de 1 serviço ativo). Ela só vale para versões **enviadas depois** de ligada: ao preparar a produção, confira se a versão precisa ser reenviada para ficar protegida. A "API Play Integrity" (0 de 7) exige integração no código e é opcional, não está planejada.
2. **Manter ≥12 testadores inscritos** até completar os 14 dias. Se alguém sair do teste, a contagem pode ser afetada. O andamento aparece em Painel → Produção.
3. Por volta de **29/11/2026**: **pedir acesso à produção** (Painel → Produção → "Solicitar a produção"). O Google faz perguntas sobre o teste fechado, e a análise leva alguns dias.
4. **Reembolso dos R$ 1,49** aos testadores, quando o Evandro quiser (Play Console → Monetizar → Pedidos).
5. Antes da produção, revisar as **pendências de segurança/LGPD** (seção 9).
6. **Fim de semana de 21–22/11/2026:** fazer a fase A do **Plano de confiabilidade e escala** (seção 9A). Começar pela assinatura do Workers Paid.

---

## 3. Funcionalidades

- **Captura rápida por texto ou voz:** o parser em PT-BR (`src/parser/parseItem.ts`) entende data, hora, categoria e recorrência. A voz usa o reconhecimento do próprio sistema (`expo-speech-recognition`), e o app recebe só o texto.
- **Telas por período:** Hoje (com o progresso do dia), Amanhã, Calendário (com arrastar), Atrasados (com contador), Histórico/Feitos. Também há as telas Mês, Quinzena e Período.
- **Categorias:** 4 fixas (Pessoal, Trabalho, Diversos, Aniversário) e as que a pessoa criar.
- **Prioridade, lembretes configuráveis** (na hora, 5 min, 30 min, 1 h, 1 dia, 1 semana) e **recorrência** (diária, semanal, mensal, anual). A recorrência é gerada **no servidor**.
- **Funciona offline:** SQLite local no Android, com sincronização incremental com o servidor.
- **Várias contas no mesmo aparelho** (alternar contas), **modo escuro** e **foto de perfil**.
- **Login:** e-mail e senha, ou Google.
- **Criptografia ponta a ponta opcional:** frase secreta e código de recuperação. Cifra título, texto original e notas.
- **Compartilhar um compromisso** com outro usuário do Avia. É uma cópia (snapshot), não um link vivo, e a pessoa precisa aceitar. Há notificação push.
- **Transferir tarefas** para outra conta: a outra pessoa aceita e a tarefa passa a pertencer a ela. O pedido expira em 7 dias.
- **"Avia que alivia!":** registros privados de pensamentos (até 500 caracteres, com título). Podem ser compartilhados, por exemplo com uma psicóloga.
- **Google Agenda (só Android, opcional):** cria eventos no calendário do aparelho, num só sentido. Nada disso vai para o servidor.
- **Excluir conta** no app ou pela web (edsavia.com.br/excluir-conta).
- **Arquivamento:** tarefas concluídas há mais de 6 meses vão do D1 para o R2, por um cron mensal.

---

## 4. Arquitetura e tecnologias

| Parte | Tecnologia | Onde |
|---|---|---|
| App | Expo **SDK 57**, React Native 0.86, React 19, TypeScript | raiz (`App.tsx`, `src/`) |
| Navegação | React Navigation 7 (drawer + stack) | `src/navigation/index.tsx` |
| Banco local | `expo-sqlite`, um arquivo por conta (`avia_<usuarioId>.db`) | `src/db/database.ts` |
| Web (PWA) | `react-native-web`, cache em memória + sync incremental | arquivos `*.web.ts`, `public/`, `functions/_middleware.js` |
| Servidor | Cloudflare **Worker** `avia-api` | `worker/src/` |
| Banco do servidor | Cloudflare **D1** `avia-db` (SQLite) | `worker/migrations/` |
| Arquivo frio | Cloudflare **R2** `avia-arquivo` | `worker/src/arquivamento.ts` |
| Site | Cloudflare **Pages**, projeto `avia`, domínio edsavia.com.br (o avia-8qu.pages.dev redireciona com 301) | `npm run deploy:web` |
| Notificações | Expo Push + FCM V1 (projeto Firebase próprio) | `src/notifications/` |
| Build Android | **EAS Build** (conta Expo `evandro1984`). Perfis: `preview` (APK) e `production` (AAB, versionCode automático e remoto) | `eas.json` |
| Pacote Android | `com.avia.app` | `app.json` |

**Atenção:** o `AGENTS.md` manda ler a documentação do Expo **v57** antes de escrever código. Ela mudou bastante em relação às versões antigas.

### Pastas de `src/`
`agenda/` (Google Agenda) · `alivia/` (pensamentos) · `auth/` (login, token, Google) · `components/` · `context/` (Items, Categorias, Compartilhamentos, Transferencias, Alivia) · `crypto/` (E2E) · `db/` · `navigation/` · `notifications/` · `parser/` · `screens/` · `sync/` (sincronização, `config.ts`) · `theme/` · `transferencias/` · `types/` · `utils/`

### Servidor: rotas principais (`worker/src/index.ts`)
- `/auth/registrar`, `/auth/login`, `/auth/google`: sem token, com limite de tentativas.
- `/items`, com `GET ?since=` para sync incremental (gera as ocorrências recorrentes antes de responder).
- `/categorias`, `/compartilhamentos`, `/usuarios/buscar`, `/arquivo`.
- `/usuario`: `DELETE` exclui a conta. Subrotas `senha`, `cifra` e `push-token`.
- `/pensamentos` e `/pensamentos-compartilhados` (em `pensamentos.ts`), `/transferencias` (em `transferencias.ts`).
- **Cron** `0 3 1 * *`: arquivamento mensal para o R2.
- **Limites de tentativas** (bindings): `LIMITE_LOGIN` 5/min por e-mail, `LIMITE_IP` 30/min, `LIMITE_USUARIO` 30/min.

---

## 5. Decisões importantes (não mudar sem motivo forte)

- **A criptografia E2E é opcional.** Ninguém é obrigado a usar. A DEK é embrulhada por duas KEKs (frase e código de recuperação), com PBKDF2 + AES-256-GCM, em JS puro (`@noble/*`).
- **Compartilhar é uma cópia (snapshot)**, porque o servidor não consegue decifrar. Para mudar o conteúdo, é preciso compartilhar de novo, e a outra pessoa aceita de novo.
- **A conclusão compartilhada vai num sentido só:** quando o criador conclui, a conclusão vale para o destinatário. Quando o destinatário marca como feita, só a cópia dele muda. Ver `sincronizarConclusaoCompartilhamentos()`.
- **O cursor de sincronização é o relógio do servidor** (campo `servidorEm`). Nunca use `Date.now()` do aparelho.
- **A sincronização é serializada:** uma por vez, junto com a limpeza de cache e a troca de conta. Se a tabela local de categorias estiver vazia, o app ignora o cursor e baixa tudo.
- **As notificações nunca mostram conteúdo:** só quem e quantos.
- **A web nunca volta a baixar a lista inteira a cada consulta.** Isso estourou o limite de leitura do D1 em 10/11/2026.
- **A transferência move a tarefa:** o `usuario_id` muda, e a origem recebe uma "lápide" em `itens_transferidos`, que chega como exclusão. Tarefas cifradas precisam ser abertas antes de transferir.

---

## 6. Como publicar (ordem e regras)

**Ordem padrão de uma mudança:**
1. Migração do D1, se houver.
2. `npx wrangler deploy`, dentro de `worker/`.
3. `npm run deploy:web` (site).
4. Commit e push.
5. Novo build EAS, **só se** o app mudou. Mudança só no servidor não precisa de build novo; confirme isso com o Evandro.

**Regras:**
- **Migrações:** antes de rodar `wrangler d1 migrations apply avia-db --remote`, compare a lista com o esquema real (`sqlite_master`). Até 13/11/2026 as migrações 0013–0022 tinham sido aplicadas "na mão", sem registro. Isso já foi corrigido, mas não repita: aplique sempre com `migrations apply`, para ficarem registradas.
- **Nunca** rode INSERT, UPDATE, DELETE ou DROP no D1 de produção sem autorização explícita do Evandro.
- **Deploy, push, merge, migração remota e build de produção:** antes, diga ao Evandro o que vai fazer e espere a confirmação.
- **Comandos que pedem login** (`eas login`, `eas credentials`, `wrangler login`): peça para o Evandro rodar no terminal.
- **Testes do servidor:** primeiro no D1 local com `wrangler dev --port 8788`, usando contas descartáveis. Depois uma rodada em produção, apagando as contas de teste.
- **Build de produção:** `npx eas build --platform android --profile production`. A chave de assinatura é a do EAS (SHA-1 `AC:8D:16:07:53:E8:2F:E7:03:A1:D6:81:81:D6:9D:12:C4:8B:98:1B`) e **não pode ser trocada**. O arquivo para o Play é o `application-<id-do-build>.aab`, baixado do expo.dev.

---

## 7. Armadilhas conhecidas

- **Upload no Play Console:** a janela de escolher arquivo pode abrir na pasta do **EDS MORSE**, cujo `app-release.aab` usa outra chave e o minSdk 23. Isso gera erros enganosos ("chave incorreta" ou "SDK 24"). Use sempre o `application-<id>.aab` do Avia.
- **`wrangler dev` deixa processos órfãos** (`workerd.exe`, `esbuild.exe`), que travam o `node_modules` (erro EBUSY). Também pode deixar duas instâncias na porta 8788. Mate os processos antes de testar de novo.
- **O relógio deste PC está cerca de 27 s adiantado** em relação ao servidor. Nos testes, use `servidorEm` como cursor.
- **Teste com emoji:** use scripts Node (`fetch`), não `curl` no bash, que corrompe os caracteres.
- **Builds EAS não se atualizam sozinhos:** um APK de teste precisa ser reinstalado pelo link.
- **O `google-services.json` fica fora do Git.** No build em nuvem ele vem da variável `GOOGLE_SERVICES_JSON` (ver `app.config.js` e `.easignore`).
- **No Pages, o `_headers` é ignorado** quando existe a pasta `functions/`. Os cabeçalhos de segurança ficam em `functions/_middleware.js`.

---

## 8. Segurança e operação

- **Segredos fora do Git:** `src/sync/secrets.ts` (sobra antiga, que o app não usa mais), `*firebase-adminsdk*.json`, `google-services.json`, `.dev.vars`, `aviatoken.txt`. Nunca mostre o conteúdo deles. Alguns ainda estão na pasta do projeto, e a recomendação é movê-los para fora.
- **Backup:** semanal e cifrado (`scripts/backup/`, ver `LEIAME.md`), com cópia local e no Google Drive, guardado por 30 dias.
- **Plano de incidentes:** `PLANO_DE_INCIDENTES.md`.
- **Documentos legais:** `POLITICA_DE_PRIVACIDADE.md` + `public/privacidade.html` (mantenha os dois iguais), `TERMOS_DE_USO.md` + `public/termos.html`, `public/excluir-conta.html`. A licença é "todos os direitos reservados".
- **Rodada de segurança de 09–10/11/2026 (6 etapas):** feita e publicada. Inclui limites de tentativas, cabeçalhos no site, revogação de sessões, troca de senha exigindo a atual, fim da chave antiga e dependências atualizadas.

---

## 9. Pendências

**Google Play:** ver os "Próximos passos" na seção 2.

**Segurança e LGPD (antes da produção):**
- Serviço de e-mail para "esqueci minha senha" e confirmação de cadastro. O Evandro adiou.
- Revisão da política e dos termos por um advogado.
- 2FA nas contas Google, Cloudflare, GitHub e Expo (o Evandro confirma).
- Apagar de vez as tarefas excluídas depois de N dias. São cerca de 590 linhas e também reduzem leituras no D1.
- Exportar os dados (portabilidade).
- A web ainda baixa as categorias inteiras a cada consulta (cerca de 16 linhas, é barato).
- Restam 5 alertas de dependências do build, que exigem uma versão maior do Expo.

**Ideias de melhoria:** ver `AVALIACAO_E_MELHORIAS.md`.

---

## 9A. Plano de confiabilidade e escala

**Meta do Evandro:** pelo menos **10.000 downloads em 1 ano**, sem deixar ninguém na mão (sem queda e sem perda de dados). Análise feita em 17/11/2026.

**Retrato em 17/11/2026 (últimas 24h):** banco com 1,75 MB e cerca de 40 contas; 54 mil linhas lidas por dia (o limite gratuito é 5 milhões); cerca de 13 mil consultas por dia. O backup semanal rodou em 16/11 às 20h, sem erro; o próximo é em 23/11.

**Projeção** (estimativa de cerca de 3 mil usuários ativos por dia no fim do ano): cerca de 11 milhões de leituras por dia e cerca de 450 MB de banco. Isso **passa do plano gratuito**, que tem limite de 5 milhões de leituras por dia e banco de até 500 MB. No **Workers Paid (US$ 5 por mês)**, cabe com folga: 25 bilhões de leituras por mês, banco de até 10 GB e Time Travel de 30 dias.

**Como o Avia reage a falhas:**
- **Servidor fora do ar:** o Android continua funcionando (SQLite local e lembretes agendados no aparelho) e sincroniza quando o servidor volta. A **web para**.
- **Proteção contra perda de dados:** são 3 camadas. A cópia em cada celular, o Time Travel do D1 (7 dias no plano grátis, 30 no pago) e o backup semanal cifrado (no PC e no Google Drive).
- **Perda irrecuperável (de propósito):** quem usa a criptografia E2E e perde a frase secreta e o código de recuperação.

**Riscos, do mais grave ao menor:**
| | Risco | Solução |
|---|---|---|
| 🔴 1 | **Plano gratuito:** desde 01/09/2026, o D1 **bloqueia as consultas** quando o limite diário é ultrapassado, até 00:00 UTC. Em 10/11 o uso chegou a 78%. | Assinar o **Workers Paid (US$ 5 por mês)** no painel da Cloudflare. Só o Evandro pode fazer, porque envolve cartão. |
| 🔴 2 | **Nenhum alerta:** um problema só é descoberto quando alguém reclama. | Alertas de uso e cobrança na Cloudflare, um monitor externo gratuito do servidor (uptime) e acompanhamento dos travamentos no Play Console (Android vitals). |
| 🟠 3 | **Uma publicação com defeito** atinge todos de uma vez. | Roteiro de testes antes de cada publicação e um procedimento de volta documentado (`npx wrangler rollback`, dentro de `worker/`). |
| 🟠 4 | **Não existe "esqueci minha senha":** gera suporte e avaliação ruim. | Serviço de e-mail para recuperação de senha e confirmação de cadastro. |
| 🟠 5 | **A restauração nunca foi ensaiada** em condição real. | Ensaio: restaurar o último `.aviabkp` num banco de teste e conferir contas e tarefas. Testar também o Time Travel (`wrangler d1 time-travel info`). |
| 🟡 6 | **Tudo depende de uma pessoa:** domínio, cartão, contas. | Lista de contas e renovações (domínio edsavia.com.br, cartão da Cloudflare, Google Play, Expo, Firebase, GitHub) e 2FA em todas. |
| 🟡 7 | **Sincronização a cada 20 s** (`INTERVALO_POLLING_MS` em `src/context/ItemsContext.tsx`): o custo cresce junto com os usuários. | No plano pago, não preocupa. Otimizar se passar de cerca de 2 mil usuários ativos por dia. |

**Fases:**
- **A. Antes de abrir a produção (meta: fim de semana de 21–22/11/2026):** itens 1, 2, 3 e 5.
- **B. Primeiros meses depois do lançamento:** itens 4 e 6, a limpeza das tarefas excluídas (cerca de 590 linhas) e o backup automático fora do PC. Hoje o backup depende do computador ligado; se ele estiver desligado às 20h de segunda, roda assim que o computador ligar.
- **C. Acima de cerca de 2 mil usuários ativos por dia:** revisar a frequência da sincronização, o tempo de resposta para o Brasil (o banco fica na região ENAM, nos EUA; avaliar a réplica de leitura do D1) e o volume de suporte.

**Status:** fase A **não iniciada**.

---

## 10. Histórico resumido

| Data | Marco |
|---|---|
| 19–20/07/2026 | Começo: parser PT-BR, SQLite, Worker + D1, login (e-mail e Google), várias contas, recorrência, microfone. |
| 25/07/2026 | Recorrência passa a ser gerada no servidor. Arquivamento no R2. |
| 21–25/08/2026 | Criptografia E2E, compartilhamento de itens, notificações push, modo escuro, foto, troca de contas, exclusão de conta. |
| 17–18/10/2026 | "Avia que alivia!", versões 1.1.0 e 1.2.0, nova identidade visual (índigo). |
| 31/10–01/11/2026 | Preparação para o Play: política, exclusão pela web, app criado (pago, R$ 1,49), chave do EAS, teste fechado com a versão 1.2.0 (3). |
| 08/11/2026 | Google Agenda (Android). Troca da frase secreta. |
| 09–10/11/2026 | Rodada de segurança (6 etapas), backup cifrado, plano de incidentes. |
| 10/11/2026 | Transferência de tarefas (migração 0021). Correção da sincronização. |
| 12/11/2026 | Redução de leituras no D1 (migração 0022, cache na web). |
| 13/11/2026 | Tudo juntado no `master`. Política atualizada. Versão **1.3.0 (4)** aprovada no teste fechado. |
| ~15/11/2026 | Convite enviado. 12 testadores ativos: começa a contagem dos 14 dias. Status de comerciante declarado. |

---

## 11. Outros documentos

- `CLAUDE.md` / `AGENTS.md`: instruções para o Claude.
- `RELATORIO_PLAY_STORE.md`: auditoria do Play de 31/10/2026.
- `AVALIACAO_E_MELHORIAS.md`: avaliação e ideias.
- `scripts/backup/LEIAME.md`: backup.
- `PROMPT_CLAUDE_CODE_*.md`: roteiros de trabalho do Evandro. Ficam fora do Git e são só para consulta.
