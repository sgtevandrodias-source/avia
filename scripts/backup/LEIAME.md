# Backup do Avia

Cópia de segurança do **banco de dados (D1)** e dos **arquivos antigos (R2)** de produção, num único arquivo **cifrado** (`.aviabkp`), guardado em dois lugares:

- no computador: `Documents\avia-backups\`
- no Google Drive: `G:\Meu Drive\Avia-backups\` (o app do Google Drive sobe sozinho para a nuvem)

Cópias com mais de **30 dias** são apagadas automaticamente — é o prazo prometido na política de privacidade. Elas só são apagadas depois que um backup novo dá certo, então nunca fica sem nenhum.

O script **só lê** a produção. O conteúdo sem cifra existe por alguns segundos numa pasta temporária, apagada no fim mesmo se der erro.

## Primeira vez (uma vez só)

No terminal, na pasta do projeto (`C:\Users\Evandro\Documents\MeusApps\Avia`):

1. Criar a senha do backup:
   ```
   node scripts/backup/backup.mjs --criar-senha
   ```
   A senha aparece na tela e fica salva em `Documents\chaves-avia\senha-backup.txt`.
   **Guarde-a também fora do computador** (gerenciador de senhas ou papel). Sem ela, os backups do Google Drive não abrem.

2. Fazer o primeiro backup na mão, para conferir:
   ```
   node scripts/backup/backup.mjs
   ```
   Deve terminar com uma linha `OK avia-backup-...`.

3. Agendar o backup semanal (toda segunda às 20h, ou assim que o computador ligar):
   ```
   powershell -ExecutionPolicy Bypass -File scripts\backup\agendar-backup.ps1
   ```

## Depois

- Cada execução deixa uma linha em `Documents\avia-backups\backup.log` (`OK` ou `ERRO`). Vale olhar uma vez por mês.
- Se aparecer `ERRO ... wrangler`, o login da Cloudflare pode ter vencido: rode `npx wrangler login` dentro da pasta `worker` e depois o backup na mão.
- Para desagendar: `powershell -ExecutionPolicy Bypass -File scripts\backup\agendar-backup.ps1 -Remover`

## Abrir um backup

```
node scripts/backup/restaurar.mjs "G:\Meu Drive\Avia-backups\avia-backup-AAAA-MM-DD_HHMM.aviabkp" C:\temp\avia-aberto
```

A pasta de destino fica com `banco.sql` (o banco inteiro) e `r2\` (arquivos antigos), **sem cifra e com dados de todos os usuários — apague-a assim que terminar.** Como restaurar a produção a partir disso está no [PLANO_DE_INCIDENTES.md](../../PLANO_DE_INCIDENTES.md).

Recomendado: a cada 6 meses, abrir o backup mais recente só para conferir que ele abre (e apagar a pasta depois).
