-- Reorganiza a lista de categorias padrão (round de UI/UX, item 5):
-- Trabalho, Pessoal, Família, Casa, Saúde, Estudos, Finanças, Lazer e Social.
-- Estratégia: reaproveita os ids de sistema já existentes pra não perder
-- nenhum item já categorizado (o id nunca é mostrado ao usuário, só o nome).
--   'social'           -> renomeia pra "Lazer e Social" (mesmo id, sem mexer nos itens)
--   'compromisso_fixo' -> renomeia pra "Finanças" (mesmo id, sem mexer nos itens)
--   'aniversario'      -> itens migram pra 'social' e a categoria é soft-deletada
--                         (senão apareceriam dois "Lazer e Social" na lista)
--   'trabalho'/'pessoal'/'saude'/'outro' -> mantém id e nome, só ganham `ordem`
--   'familia'/'casa'/'estudos'           -> novas, criadas pra cada usuário já existente

ALTER TABLE categorias ADD COLUMN ordem INTEGER NOT NULL DEFAULT 999;

UPDATE categorias SET ordem = 0 WHERE id = 'trabalho';
UPDATE categorias SET ordem = 1 WHERE id = 'pessoal';
UPDATE categorias SET ordem = 4 WHERE id = 'saude';
UPDATE categorias SET nome = 'Finanças', ordem = 6 WHERE id = 'compromisso_fixo';
UPDATE categorias SET nome = 'Lazer e Social', ordem = 7 WHERE id = 'social';
UPDATE categorias SET ordem = 8 WHERE id = 'outro';

UPDATE items SET categoria = 'social', atualizado_em = datetime('now')
WHERE categoria = 'aniversario';

UPDATE categorias SET excluido = 1, atualizado_em = datetime('now')
WHERE id = 'aniversario';

INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em, excluido)
SELECT 'familia', usuario_id, 'Família', '👨‍👩‍👧', '#FF8B94', 1, 2, datetime('now'), datetime('now'), 0
FROM (SELECT DISTINCT usuario_id FROM categorias)
ON CONFLICT(id, usuario_id) DO NOTHING;

INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em, excluido)
SELECT 'casa', usuario_id, 'Casa', '🏡', '#6FCF97', 1, 3, datetime('now'), datetime('now'), 0
FROM (SELECT DISTINCT usuario_id FROM categorias)
ON CONFLICT(id, usuario_id) DO NOTHING;

INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em, excluido)
SELECT 'estudos', usuario_id, 'Estudos', '📚', '#56CCF2', 1, 5, datetime('now'), datetime('now'), 0
FROM (SELECT DISTINCT usuario_id FROM categorias)
ON CONFLICT(id, usuario_id) DO NOTHING;
