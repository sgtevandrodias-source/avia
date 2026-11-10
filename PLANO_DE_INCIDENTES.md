# Plano de resposta a incidentes do Avia

> Para Evandro (controlador dos dados). Ler com calma uma vez; no dia do problema, seguir na ordem.
> Prazos legais citados aqui foram conferidos em fontes secundárias — **confirmar com o advogado** e no texto da Resolução CD/ANPD nº 15/2024.
> Este arquivo está num repositório público: **não anotar aqui** senhas, nomes de usuários afetados nem detalhes de um incidente real (ver passo 5).

## O que conta como incidente

Qualquer situação em que dados dos usuários possam ter sido vistos, copiados, alterados ou apagados por quem não devia. Exemplos:

- alguém entrou na conta da Cloudflare, do Google, do GitHub ou da Expo;
- o segredo das sessões (`JWT_SECRET`), a senha do backup ou um arquivo de backup vazou;
- o computador ou o celular com acesso a essas contas foi roubado;
- um erro no app ou no servidor mostrou dados de uma pessoa para outra;
- os dados sumiram ou foram corrompidos.

## 1. Conter (primeira hora)

Faça só o que se aplica ao caso:

| Situação | O que fazer |
|---|---|
| Conta da Cloudflare/Google/GitHub/Expo invadida | Trocar a senha, ligar a verificação em duas etapas, encerrar as sessões abertas e apagar tokens de API que você não reconhece (Cloudflare: My Profile → API Tokens). |
| Sessões podem ter vazado (`JWT_SECRET`) | Na pasta `worker`: `npx wrangler secret put JWT_SECRET` e cole um valor novo e longo. **Todo mundo é desconectado** e o app mostra "Entre de novo". |
| Uma publicação nova do servidor está expondo dados | Na pasta `worker`: `npx wrangler rollback` (volta para a versão anterior). |
| O site publicado está com problema | Painel da Cloudflare → Workers & Pages → `avia` → Deployments → versão anterior → Rollback. |
| Dados apagados/corrompidos há menos de 30 dias | Ver "Restaurar" abaixo (opção A). |
| Senha do backup vazou | Apagar `Documents\chaves-avia\senha-backup.txt`, criar outra (`node scripts/backup/backup.mjs --criar-senha`), apagar os backups antigos do Google Drive e do computador e rodar um backup novo. |
| Computador roubado | Tudo da primeira linha, mais `JWT_SECRET` novo e senha do backup nova (de outro computador). |

## 2. Entender (no mesmo dia)

Anote (em lugar privado — ver passo 5):

- o que aconteceu e **quando você ficou sabendo** (os prazos contam daí);
- quais dados podem ter sido afetados: contas (nome, e-mail), tarefas, registros do **"Avia que alivia!"** (dado sensível de saúde — risco maior), compartilhamentos;
- quantas contas;
- se o conteúdo estava com **criptografia ponta a ponta** (se sim, o texto continua ilegível para quem pegou);
- o que já foi feito para conter.

## 3. Comunicar (se houver risco ou dano relevante aos usuários)

- **ANPD:** em até **3 dias úteis** a partir de quando você soube que dados pessoais foram afetados. Agentes de pequeno porte têm o prazo em dobro (6 dias úteis), possivelmente exigindo declaração dessa condição — confirmar. A comunicação é feita pelo formulário no site da ANPD (gov.br/anpd → Comunicação de Incidente de Segurança). Ela pode ser complementada depois.
- **Usuários afetados:** e-mail claro e sem jargão. Modelo:

  > Assunto: Aviso de segurança sobre sua conta no Avia
  >
  > Olá, [nome]. Em [data], identificamos [o que aconteceu, em uma frase]. Os dados que podem ter sido afetados são: [lista]. [Se aplicável: seu conteúdo estava protegido com criptografia ponta a ponta e continua ilegível.] Já fizemos o seguinte: [medidas]. Recomendamos que você [ex.: troque sua senha]. Se tiver dúvidas, responda este e-mail.
  > Evandro Dias — Avia

- Envie com os destinatários em **Cco** (cópia oculta), nunca todos visíveis.
- Em dúvida se precisa comunicar: fale com o advogado no mesmo dia.

## 4. Restaurar dados

**Opção A — voltar o banco no tempo (problema de até 30 dias atrás).** A Cloudflare guarda o histórico do banco:

```
cd worker
npx wrangler d1 time-travel info avia-db --timestamp=2026-11-09T12:00:00Z
npx wrangler d1 time-travel restore avia-db --timestamp=2026-11-09T12:00:00Z
```

Use um horário **anterior** ao problema. Tudo o que aconteceu depois desse horário é desfeito (inclusive tarefas legítimas criadas depois), então avalie antes.

**Opção B — a partir do backup semanal (problemas mais antigos ou banco perdido):**

1. Abrir o backup: `node scripts/backup/restaurar.mjs <arquivo.aviabkp> C:\temp\avia-aberto`
2. Criar um banco novo e carregar o backup nele (o banco atual fica intacto para comparação):
   ```
   cd worker
   npx wrangler d1 create avia-db-restaurado
   npx wrangler d1 execute avia-db-restaurado --remote --file=C:\temp\avia-aberto\banco.sql
   ```
3. Conferir os dados e, só então, trocar o `database_id` em `worker/wrangler.toml` pelo do banco novo e publicar (`npx wrangler deploy`).
4. Se precisar dos arquivos antigos: `npx wrangler r2 object put avia-arquivo/<caminho> --remote --file=<arquivo>` (os nomes em `r2\` usam `__` no lugar de `/`).
5. Apagar `C:\temp\avia-aberto`.

## 5. Registrar

Todo incidente — comunicado ou não — precisa ficar registrado por pelo menos **5 anos**: data, o que houve, dados e contas afetados, avaliação de risco, medidas tomadas e se/quando houve comunicação. Guarde esse registro **fora do repositório** (ex.: `Documents\chaves-avia\registro-de-incidentes.md`), porque o repositório é público.

## 6. Depois

- Corrigir a causa e anotar o que mudou.
- Revisar este plano uma vez por ano e testar a abertura de um backup a cada 6 meses (ver `scripts/backup/LEIAME.md`).

## Contatos

- ANPD: gov.br/anpd
- Suporte da Cloudflare: painel da Cloudflare → Support
- Advogado: _(preencher)_
