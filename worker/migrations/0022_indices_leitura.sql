-- Economia de leitura no D1 (limite diário do plano gratuito: 5 milhões de
-- linhas lidas). Migração só aditiva: três índices, nenhum dado muda.
--
-- "O que mudou desde..." (GET /items?since= e /categorias?since=): com o
-- índice só por usuario_id, o banco percorria TODAS as linhas da conta pra
-- achar as poucas alteradas — numa conta com ~1.400 linhas, ~900 lidas por
-- sincronização. Com (usuario_id, atualizado_em) lê só as alteradas.
CREATE INDEX IF NOT EXISTS idx_items_usuario_atualizado ON items(usuario_id, atualizado_em);
CREATE INDEX IF NOT EXISTS idx_categorias_usuario_atualizado ON categorias(usuario_id, atualizado_em);

-- Geração de ocorrências: lia todas as séries da conta (inclusive as
-- desligadas) a cada GET /items. Com (usuario_id, ativa) lê só as ativas.
CREATE INDEX IF NOT EXISTS idx_series_usuario_ativa ON series_recorrentes(usuario_id, ativa);
