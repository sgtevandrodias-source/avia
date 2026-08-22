-- Reduz as categorias de sistema para só 4: Pessoal, Trabalho, Diversos e
-- Aniversário — mantém os MESMOS ids ('pessoal', 'trabalho', 'outro',
-- 'aniversario') pra não perder nenhum item já categorizado com eles.
-- As demais (Família, Casa, Saúde, Estudos, Finanças, Lazer) são
-- soft-deletadas e os itens que estavam nelas migram pra 'outro' (Diversos).

UPDATE items SET categoria = 'outro', atualizado_em = datetime('now')
WHERE categoria IN ('familia', 'casa', 'saude', 'estudos', 'compromisso_fixo', 'social');

UPDATE categorias SET excluido = 1, atualizado_em = datetime('now')
WHERE id IN ('familia', 'casa', 'saude', 'estudos', 'compromisso_fixo', 'social');

UPDATE categorias SET ordem = 0 WHERE id = 'pessoal';
UPDATE categorias SET ordem = 1 WHERE id = 'trabalho';
UPDATE categorias SET nome = 'Diversos', ordem = 2 WHERE id = 'outro';
UPDATE categorias SET ordem = 3 WHERE id = 'aniversario';
