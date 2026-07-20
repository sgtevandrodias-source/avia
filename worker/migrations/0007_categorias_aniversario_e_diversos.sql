-- Ajuste na lista de categorias padrão: "Lazer e Social" volta a se separar
-- em "Lazer" (id 'social', mesmo id) e "Aniversário" (id 'aniversario', que
-- tinha sido soft-deletado/mesclado em 'social' na migração 0006 — revive o
-- mesmo id em vez de criar um novo). "Outro" passa a se chamar "Diversos"
-- (mesmo id 'outro').
--   'social'      -> renomeia pra "Lazer", ordem 7
--   'aniversario' -> revive (excluido = 0), nome "Aniversário", ordem 8
--   'outro'       -> renomeia pra "Diversos", ordem 9
-- Itens que foram migrados de 'aniversario' pra 'social' na migração 0006
-- voltam pra 'aniversario' com base no texto original (heurística segura:
-- os textos ditados literalmente contêm "aniversário"/"parabenizar"/"felicitar").

UPDATE categorias SET nome = 'Lazer', ordem = 7 WHERE id = 'social';

UPDATE categorias SET nome = 'Aniversário', ordem = 8, excluido = 0, atualizado_em = datetime('now')
WHERE id = 'aniversario';

UPDATE categorias SET nome = 'Diversos', ordem = 9 WHERE id = 'outro';

UPDATE items SET categoria = 'aniversario', atualizado_em = datetime('now')
WHERE categoria = 'social'
  AND (
    texto_original LIKE '%aniversario%' OR texto_original LIKE '%aniversário%' OR
    texto_original LIKE '%parabenizar%' OR texto_original LIKE '%felicitar%' OR
    titulo LIKE '%aniversario%' OR titulo LIKE '%aniversário%' OR
    titulo LIKE '%parabenizar%' OR titulo LIKE '%felicitar%'
  );
