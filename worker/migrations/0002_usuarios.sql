-- Fase 1: autenticacao e multiusuario.
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  senha_hash TEXT,
  google_sub TEXT UNIQUE,
  criado_em TEXT NOT NULL
);

-- Usuario "legado" pra nao perder os itens que ja existiam antes da autenticacao.
INSERT OR IGNORE INTO usuarios (id, email, nome, senha_hash, google_sub, criado_em)
VALUES ('legado', 'legado@avia.local', 'Evandro', NULL, NULL, datetime('now'));

ALTER TABLE items ADD COLUMN usuario_id TEXT NOT NULL DEFAULT 'legado';
CREATE INDEX IF NOT EXISTS idx_items_usuario_id ON items(usuario_id);
