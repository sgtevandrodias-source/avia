# Relatório de auditoria — AVIA no Google Play

Data: 31/10/2026 · Auditoria somente leitura (nenhum arquivo de código, configuração ou dependência foi alterado).

## Resumo

**Ainda não está pronto para publicar, mas está perto.** O app em si está em bom estado técnico. Os bloqueios são quase todos **fora do código**: documentos, imagens da loja e uma escolha importante no Play Console.

- **5 bloqueios ❌**
  1. Escolha da chave de assinatura no Play Console. É um passo **irreversível** e decide se quem já usa o APK consegue atualizar pela loja.
  2. Política de Privacidade ainda é rascunho e não está publicada.
  3. Falta uma página na web para pedir a exclusão da conta.
  4. Faltam capturas de tela e a imagem de destaque (1024×500).
  5. O ícone 512×512 que existe é da identidade visual antiga.
- **11 pontos de atenção ⚠️**: nenhum deles impede a publicação, mas vale resolver.
- O que já está certo: nome do pacote nunca mudou, o build de produção gera AAB, o Android alvo é o 16 (API 36), não há permissões de alarme exato, o app tem exclusão de conta, não há segredos no git e o TypeScript compila sem erros.

## Tabela de verificação

| # | Item | Status | Onde / evidência |
|---|------|--------|------------------|
| 1.1 | `name` = "AVIA", `slug` = "avia" | ✅ | [app.json:3-4](app.json#L3-L4) |
| 1.2 | `version` = 1.2.0 | ✅ | [app.json:5](app.json#L5) |
| 1.3 | `android.package` = `com.avia.app` | ✅ | [app.json:15](app.json#L15). O histórico do git mostra que ele nunca mudou desde o 1º commit (19/07). O APK local `avia.apk` também usa `com.avia.app`. |
| 1.4 | Pacote livre no Play | ✅ | `play.google.com/store/apps/details?id=com.avia.app` responde 404 (nenhum outro app usa esse pacote) |
| 1.5 | `android.versionCode` | ✅ | Não fica no app.json: é controlado pelo EAS (`"appVersionSource": "remote"` + `"autoIncrement": true`, [eas.json:4](eas.json#L4), [eas.json:21](eas.json#L21)). O APK local tem versionCode 2. |
| 1.6 | Ícone, ícone adaptativo e splash | ✅ | [app.json:7](app.json#L7), [app.json:17-20](app.json#L17-L20), [app.json:30-38](app.json#L30-L38). `assets/icon.png` tem 1024×1024 e o foreground tem 432×432. |
| 1.7 | Ícone monocromático (Android 13+) | ⚠️ | `assets/android-icon-monochrome.png` existe, mas não é usado no app.json. Sem ele, o ícone temático do Android fica genérico. |
| 1.8 | Ícone das notificações | ⚠️ | [app.json:43](app.json#L43) usa `assets/icon.png`, que é colorido e sem transparência. O Android mostra isso como um quadrado branco ou cinza na barra de notificações. O ideal é uma silhueta branca com fundo transparente. |
| 2.1 | Perfil de produção gera AAB | ✅ | [eas.json:22-24](eas.json#L22-L24) `"buildType": "app-bundle"` |
| 2.2 | Credenciais de assinatura | ✅/⚠️ | Não existe `credentials.json` local, então as credenciais são **remotas (no EAS)**. O APK atual é assinado com o certificado **SHA-1 `AC:8D:16:07:53:E8:2F:E7:03:A1:D6:81:81:D6:9D:12:C4:8B:98:1B`** (SHA-256 `e599b8a9…a2724b96`). Isso foi lido do `avia.apk` com `apksigner`. ⚠️ Vale confirmar em expo.dev → Credentials que o keystore do EAS é esse mesmo (o `avia.apk` local é de 24/08, versão 1.0.0). |
| 2.3 | Chave de assinatura no Play (Play App Signing) | ❌ | Ver Bloqueio 1. |
| 2.4 | Expo SDK / targetSdk | ✅ | Expo SDK 57 ([package.json:18](package.json#L18)), React Native 0.86 → `targetSdk = 36`, `compileSdk = 36` (`node_modules/react-native/gradle/libs.versions.toml:4-5`). Confirmado no APK: `targetSdkVersion:'36'`. Não usa `expo-build-properties`, e não precisa. |
| 2.5 | Build pelo GitHub Actions | ⚠️ | [.github/workflows/build-android.yml:49](.github/workflows/build-android.yml#L49) usa o perfil **preview** (gera APK). Para a loja é preciso usar o perfil **production** (gera AAB). |
| 3.1 | `RECORD_AUDIO` | ✅ | Usada para o ditado por voz: [CapturaRapida.tsx:109](src/components/CapturaRapida.tsx#L109) e [CampoPensamento.tsx:126](src/components/CampoPensamento.tsx#L126). Vem do plugin `expo-speech-recognition` ([app.json:49-55](app.json#L49-L55)). |
| 3.2 | `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `c2dm.RECEIVE` | ✅ | Lembretes e push: [notifications.ts](src/notifications/notifications.ts), [pushToken.ts](src/notifications/pushToken.ts). Vêm do `expo-notifications` e do Firebase. |
| 3.3 | `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` | ✅ | **Não estão declaradas** (conferido no APK). Nada a declarar ao Google. |
| 3.4 | `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE` | ✅ | Sincronização e vibração (`expo-haptics` em [ItemCard.tsx:5](src/components/ItemCard.tsx#L5)). |
| 3.5 | `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (até Android 12) | ⚠️ | **Não são usadas.** Vêm do `expo-file-system` e do modelo padrão do Expo. O app só mexe na sua pasta interna ([database.ts:3](src/db/database.ts#L3)). Podem ser removidas. |
| 3.6 | `SYSTEM_ALERT_WINDOW` (desenhar sobre outros apps) | ⚠️ | **Não é usada.** Vem do modelo padrão do React Native/Expo. Assusta o usuário e chama atenção na revisão. Recomendo remover. |
| 3.7 | `USE_BIOMETRIC` / `USE_FINGERPRINT` | ⚠️ | **Não são usadas** (nenhum `requireAuthentication` no código). Vêm do `expo-secure-store`. Podem ser removidas. |
| 3.8 | Permissões de "badge" (Samsung, Huawei, etc.) e `INSTALL_REFERRER` | ✅ | Inofensivas, adicionadas automaticamente por bibliotecas. O Google não pede declaração. |
| 3.9 | Localização, contatos, câmera | ✅ | Nenhuma declarada. |
| 4.1 | Biblioteca de login | ✅ | `@react-native-google-signin/google-signin` 16.x ([googleSignIn.ts:1](src/auth/googleSignIn.ts#L1)), com o Client ID **Web** `338993673589-m2tk…` ([googleSignIn.ts:7](src/auth/googleSignIn.ts#L7)). O mesmo ID é validado no servidor ([worker/wrangler.toml:6](worker/wrangler.toml#L6)). |
| 4.2 | SHA-1 no Google Cloud | ⚠️ | O SHA-1 não fica no código: fica cadastrado no Client ID **Android** do Google Cloud Console (pacote `com.avia.app` + SHA-1). Ver Bloqueio 1 e o item "Login com Google" logo abaixo dele. |
| 5.1 | Excluir conta **dentro do app** | ✅ | Configurações → "Excluir conta e todos os dados" ([SettingsScreen.tsx:136-137](src/screens/SettingsScreen.tsx#L136-L137)) → [ExcluirContaScreen.tsx](src/screens/ExcluirContaScreen.tsx) |
| 5.2 | Endpoint de exclusão no Worker | ✅ | `DELETE /usuario` ([worker/src/index.ts:1055-1060](worker/src/index.ts#L1055-L1060)) apaga de verdade itens, categorias, séries, criptografia, tokens de push, arquivos no R2, compartilhamentos, registros do "Avia que alivia!" e o usuário ([worker/src/index.ts:1024-1045](worker/src/index.ts#L1024-L1045)). |
| 5.3 | Exclusão por **link na web** | ❌ | Ver Bloqueio 3. |
| 5.4 | Política de Privacidade publicada | ❌ | Ver Bloqueio 2. |
| 6.1 | Segredos no git | ✅ | Nenhum `.env`. `google-services.json`, a chave `*firebase-adminsdk*.json`, `src/sync/secrets.ts` e `aviatoken.txt` estão no [.gitignore](.gitignore) e **nunca foram commitados** (histórico verificado). |
| 6.2 | Segredos dentro do app | ✅ | `src/sync/secrets.ts` (chave de API antiga) **não é importado** por nenhum arquivo, então não entra no app. O Client ID Web do Google é público por natureza. |
| 6.3 | Arquivos sensíveis soltos na pasta | ⚠️ | A chave de administrador do Firebase (`avia-app-fb7f2-firebase-adminsdk-…json`) e o `aviatoken.txt` estão na raiz do projeto. Estão protegidos pelo `.gitignore`/`.easignore`, mas o mais seguro é guardá-los fora da pasta. |
| 6.4 | Chave de API antiga ainda aceita pelo servidor | ⚠️ | [worker/src/index.ts:423](worker/src/index.ts#L423) aceita a `API_KEY` como acesso administrativo à conta "legado". Não afeta usuários, mas é uma porta a mais. Avaliar se ainda é necessária. |
| 6.5 | URLs de desenvolvimento / localhost | ✅ | Nenhuma. O app só fala com `https://avia-api.sgtevandrodias.workers.dev` ([config.ts:1](src/sync/config.ts#L1)). |
| 6.6 | `console.log` com dados | ✅ | Nenhum `console.*` em `src/`, `App.tsx` ou `worker/src/`. |
| 6.7 | Telas ou botões de teste | ✅ | Nenhum encontrado. |
| 7.1 | `npx tsc --noEmit` | ✅ | Sem erros. |
| 7.2 | `npx expo config --type public` | ✅ | Configuração final coerente (pacote, ícones, plugins, `RECORD_AUDIO`). |
| 7.3 | `npx expo-doctor` | ⚠️ | 18/21 checagens OK. Falharam 3: (a) 13 pacotes com versão de correção atrasada (ex.: `expo` 57.0.7 → 57.0.31, `react-native` 0.86.0 → 0.86.3); (b) **a versão do Hermes (motor JavaScript) tem um vazamento de memória conhecido**, corrigido no `expo` 57.0.9+; (c) falta declarar `react-native-reanimated` (usado pelo menu lateral). Hoje ele já vem instalado de forma indireta, por isso funciona. |
| 7.4 | Offline e tratamento de erros | ✅ | Banco local SQLite com sincronização em segundo plano. A sincronização encerra em silêncio se estiver offline ([sync.ts:194](src/sync/sync.ts#L194)). O "Avia que alivia!" salva primeiro no aparelho ([armazenamento.ts:9](src/alivia/armazenamento.ts#L9)). As telas de exclusão, criptografia e configurações mostram aviso em caso de erro. |
| 8.1 | Ícone 512×512 da loja | ❌ | `avia.512.png` existe, mas é o logo antigo (preto). O ícone atual é o índigo (`assets/icon.png`, 1024×1024). Ver Bloqueio 5. |
| 8.2 | Imagem de destaque 1024×500 | ❌ | Não existe. |
| 8.3 | Capturas de tela do celular (mín. 2) | ❌ | Não existem. |
| 8.4 | Textos da ficha (descrição curta e completa) | ⚠️ | Não estão no projeto. Existe material de divulgação em `marketing/` que pode servir de base. |
| 9.1 | Conta de desenvolvedor pessoal | ⚠️ | Não verificável daqui. Se a conta do Play Console for **pessoal e nova**, o Google exige um **teste fechado com pelo menos 12 testadores por 14 dias** antes de liberar a publicação para todos. |

## Bloqueios, em ordem de prioridade

Nenhuma correção foi aplicada. Abaixo está só a descrição do que fazer.

### Bloqueio 1 — Escolher a chave certa ao criar o app no Play Console (CRÍTICO e irreversível)
**Problema:** o Play Console, por padrão, cria uma chave **nova** do Google para assinar o app. Se isso acontecer, o app da loja terá uma "assinatura" diferente do APK que os usuários já têm. Com isso, **o Android não deixa atualizar**: cada usuário teria que desinstalar o app antigo e instalar o da loja.
**Correção sugerida:** no primeiro envio, em "Assinatura de apps do Google Play", escolher **usar a chave de assinatura existente** (exportar e enviar a chave do EAS). O EAS fornece o keystore em `eas credentials` → Android → "Download keystore", e o Play Console orienta o envio com a ferramenta PEPK.
- Com isso, a chave que o Google usa continua sendo a de SHA-1 `AC:8D:16:…:8B:98:1B`. Usuários atuais conseguem atualizar pela loja e **o login com Google continua funcionando sem mudanças**.
- Antes disso, confirmar em expo.dev que o keystore do EAS tem esse SHA-1.
- Atenção: se algum usuário tiver dados só no aparelho e precisar reinstalar, ele perde o que não foi sincronizado. Escolhendo a chave certa, isso não acontece.

**Login com Google (o que fazer em cada caso)**
- **Se seguir o Bloqueio 1 (chave existente):** o SHA-1 do app da loja será o mesmo de hoje. Basta conferir no Google Cloud Console (APIs e serviços → Credenciais → Client ID Android de `com.avia.app`) que o SHA-1 `AC:8D:16:07:53:E8:2F:E7:03:A1:D6:81:81:D6:9D:12:C4:8B:98:1B` está lá.
- **Se o Google gerar uma chave nova:** depois do primeiro envio, copiar o SHA-1 em Play Console → Configuração → Integridade do app → "Certificado da chave de assinatura de apps" e **criar um segundo Client ID Android** no Google Cloud com esse SHA-1 (sem apagar o atual, que serve ao APK antigo). Sem isso, o login falha ("DEVELOPER_ERROR") para quem instalar pela loja.

### Bloqueio 2 — Publicar a Política de Privacidade
**Problema:** [POLITICA_DE_PRIVACIDADE.md](POLITICA_DE_PRIVACIDADE.md) está marcada como **RASCUNHO**, com campos em branco (nome do responsável, e-mail de contato, data, idade mínima). Também não está publicada: o endereço `https://avia-8qu.pages.dev/privacidade` só abre o próprio app, não uma página de política.
**Correção sugerida:** preencher os campos, revisar o texto e publicar como página fixa, por exemplo `https://avia-8qu.pages.dev/privacidade.html` (arquivo estático na pasta `public/`). Depois, colocar o link no Play Console e, de preferência, também nas Configurações do app.
**Aproveitar a revisão para:**
- deixar claro que, **sem** a criptografia ativada, o conteúdo fica guardado no servidor sem criptografia ponta a ponta (só protegido no transporte);
- dizer que o reconhecimento de voz do Android pode enviar o áudio ao serviço do Google, que é quem converte a fala em texto (o AVIA não recebe nem guarda o áudio);
- informar que a exclusão também pode ser pedida pela página da web (Bloqueio 3).

### Bloqueio 3 — Página na web para pedir exclusão da conta
**Problema:** o Google exige um **link na web** onde a pessoa consiga pedir a exclusão da conta mesmo sem o app instalado. Hoje não há uma página assim: `/excluir-conta` só abre o app web.
**Correção sugerida:** criar uma página estática simples (ex.: `https://avia-8qu.pages.dev/excluir-conta.html`) que:
- diga o nome do app ("AVIA");
- explique o passo a passo: entrar em `https://avia-8qu.pages.dev`, ir em Configurações → "Excluir conta e todos os dados". A versão web já tem essa opção;
- ofereça a alternativa de pedir por e-mail;
- liste o que é apagado e em quanto tempo.

### Bloqueio 4 — Capturas de tela e imagem de destaque
**Problema:** não existem.
**Correção sugerida:** produzir
- de 2 a 8 capturas de tela do celular (sugestão: Hoje, Calendário, criar item por voz, "Avia que alivia!", Compartilhados), com a identidade índigo atual;
- uma imagem de destaque de 1024×500 (logo índigo + frase curta, ex.: "Avia que alivia!").

### Bloqueio 5 — Ícone 512×512 da loja atualizado
**Problema:** `avia.512.png` é o logo antigo (preto). O app usa o logo índigo.
**Correção sugerida:** gerar um PNG de 512×512 (até 1 MB) a partir de `assets/icon.png`.

### Pontos de atenção recomendados (não bloqueiam)
1. **Remover permissões que não são usadas:** `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE`, `USE_BIOMETRIC` e `USE_FINGERPRINT`, via `android.blockedPermissions` no app.json. É seguro, mas testar antes em um APK preview.
2. **Atualizar as versões de correção do Expo** (`npx expo install --fix`), por causa do vazamento de memória do Hermes. Fazer **antes** de gerar o AAB da loja e testar em um APK preview com os usuários atuais.
3. Declarar `react-native-reanimated` no package.json (o menu lateral depende dele).
4. Ícone de notificação próprio (silhueta branca com fundo transparente) e ligar o ícone monocromático no `adaptiveIcon`.
5. Para a loja, gerar com `eas build --platform android --profile production` (AAB). O workflow do GitHub gera APK preview.
6. Guardar a chave de administrador do Firebase e o `aviatoken.txt` fora da pasta do projeto.
7. Avaliar se o acesso administrativo pela `API_KEY` antiga no servidor ainda é necessário.

## Inventário de dados para o formulário "Segurança dos dados"

**Respostas gerais**
- **O app coleta ou compartilha dados?** Sim, coleta.
- **Criptografia em trânsito?** **Sim.** Toda a comunicação usa HTTPS (`https://avia-api.sgtevandrodias.workers.dev`).
- **O usuário pode pedir a exclusão dos dados?** **Sim**, no app (Configurações → Excluir conta) e pela página da web do Bloqueio 3.
- **Compartilhamento com terceiros:** **Não.** Cloudflare (servidor e banco), Google (login) e Expo/Firebase (entrega de notificações) são prestadores de serviço, e o Google não conta isso como "compartilhamento". O compartilhamento entre usuários do AVIA é iniciado pelo próprio usuário, então também não conta.
- **Analytics, rastreamento de falhas ou publicidade:** **nenhum.** O app não tem Firebase Analytics, Crashlytics, Sentry nem SDK de anúncios.

| Categoria no formulário | Dado | Coletado? | Obrigatório? | Para quê | Observações |
|---|---|---|---|---|---|
| Informações pessoais → Nome | Nome da conta Google ou do cadastro | Sim | Sim | Gerenciamento da conta; mostrado a quem você compartilha | |
| Informações pessoais → Endereço de e-mail | E-mail | Sim | Sim | Gerenciamento da conta; achar o usuário ao compartilhar | |
| Informações pessoais → IDs de usuário | ID interno da conta e ID do Google (`google_sub`) | Sim | Sim | Gerenciamento da conta | [worker/src/index.ts:480-481](worker/src/index.ts#L480-L481) |
| Fotos e vídeos → Fotos | **Link** da foto de perfil do Google | Sim (só o link) | Não (só para quem entra com Google) | Mostrar o avatar | O app guarda o endereço da foto, não a imagem |
| Atividade no app → Outros conteúdos gerados pelo usuário | Tarefas, compromissos, lembretes, categorias, anotações, registros do "Avia que alivia!", compartilhamentos | Sim | Sim (é a função do app) | Funcionalidade do app; sincronizar entre aparelhos | Guardados no Cloudflare D1/R2. Sem a criptografia ativada, o texto fica legível no servidor; **com** ela, fica cifrado. Os registros do "Avia que alivia!" podem conter informações emocionais (dado sensível pela LGPD). |
| IDs do dispositivo ou outros IDs | Token de notificação (Expo Push / Firebase) | Sim | Não (só se permitir notificações) | Enviar avisos de compartilhamento | |
| Áudio → Gravações de voz | Áudio do ditado | **Não coletado pelo AVIA** | — | — | O áudio vai para o reconhecedor de voz do próprio Android (serviço do Google), que devolve só o texto. O texto vira conteúdo do usuário (linha acima). O AVIA não envia nem guarda áudio. |
| Localização, contatos, fotos da galeria, arquivos, dados financeiros, saúde (sensores), histórico de navegação | — | Não | — | — | |

**Observação sobre a criptografia ponta a ponta:** é **opcional** (Configurações → criptografia). O formulário não tem campo para isso. Vale mencionar na Política de Privacidade e na descrição da loja como diferencial.
