-- Fase 1 (bug de recorrência travando sem conclusão manual): guarda o id do
-- item raiz da série recorrente em cada ocorrência gerada, pra achar todas
-- as ocorrências já existentes de uma série e nunca duplicar. Itens já
-- salvos ficam com NULL — cada um é tratado como raiz da própria série.
ALTER TABLE items ADD COLUMN origem_recorrencia_id TEXT;
