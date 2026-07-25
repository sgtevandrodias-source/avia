-- Catálogo de anos já movidos pro armazenamento frio (R2). O Worker consulta
-- essa tabela pra responder GET /arquivo (quais anos existem) sem precisar
-- abrir o R2, e pra saber o que já foi arquivado antes de rodar o cron de
-- novo no mês seguinte.
CREATE TABLE IF NOT EXISTS arquivos (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL,
  ano INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  quantidade_itens INTEGER NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  criado_em TEXT NOT NULL,
  UNIQUE(usuario_id, ano)
);

CREATE INDEX IF NOT EXISTS idx_arquivos_usuario_id ON arquivos(usuario_id);
