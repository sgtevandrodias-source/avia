-- Fase 3: categorias editaveis por usuario (CRUD + sync last-write-wins,
-- mesmo padrao de items). Chave composta (id, usuario_id): categorias de
-- sistema usam slugs fixos ('social', 'aniversario' etc.) repetidos por
-- usuario; categorias custom usam um uuid gerado no momento da criacao.
CREATE TABLE IF NOT EXISTS categorias (
  id TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  icone TEXT NOT NULL,
  cor TEXT NOT NULL,
  sistema INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_categorias_usuario_id ON categorias(usuario_id);
CREATE INDEX IF NOT EXISTS idx_categorias_atualizado_em ON categorias(atualizado_em);
