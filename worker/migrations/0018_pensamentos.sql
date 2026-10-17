-- "Avia que alivia!": registro de pensamentos (até 500 caracteres) e o
-- compartilhamento deles com outro usuário do Avia (ex.: a psicóloga).
-- Migração SÓ ADITIVA: cria duas tabelas novas e não toca em nenhuma tabela
-- existente — versões antigas do app nunca leem nem escrevem aqui.

-- Registros do próprio usuário. `texto` pode vir cifrado pelo aparelho
-- (prefixo AVIA1:, mesmo formato de items — ver src/crypto/wireFormat.ts)
-- quando a criptografia ponta a ponta está ativa; o servidor nunca lê o
-- conteúdo, só guarda como string opaca.
CREATE TABLE IF NOT EXISTS pensamentos (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL,
  texto TEXT NOT NULL,
  registrado_em TEXT NOT NULL, -- data/hora do registro (automática, no aparelho)
  -- Soft delete, mesmo padrão de items/categorias: sem isso, apagar num
  -- aparelho nunca chegaria aos outros pela sincronização incremental.
  excluido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pensamentos_usuario ON pensamentos(usuario_id, atualizado_em);

-- Compartilhamento de um registro com outro usuário. Mesmo raciocínio de
-- compartilhamentos (migration 0014): cada conta tem a própria chave, então
-- guardamos um SNAPSHOT do texto já decifrado no aparelho de quem
-- compartilhou. Quem recebe só lê; precisa aceitar antes de ver o texto.
CREATE TABLE IF NOT EXISTS pensamentos_compartilhados (
  id TEXT PRIMARY KEY NOT NULL,
  pensamento_id TEXT NOT NULL,
  criador_id TEXT NOT NULL,
  criador_nome TEXT NOT NULL,
  destinatario_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'aceito' | 'recusado'
  texto TEXT NOT NULL,
  registrado_em TEXT NOT NULL,
  excluido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE(pensamento_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_pensamentos_compartilhados_destinatario ON pensamentos_compartilhados(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_pensamentos_compartilhados_criador ON pensamentos_compartilhados(criador_id, pensamento_id);
