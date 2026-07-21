-- Corrige bug: apagar a ocorrência mais recente de uma série recorrente
-- fazia ela "voltar" no próximo carregamento (gerarOcorrenciasPendentes
-- calculava o "tip" só pelas ocorrências sobreviventes, expondo a anterior,
-- já vencida, como a mais recente). Esse bookmark, gravado na raiz da
-- série, guarda até que data já foi gerada — mesmo que aquela ocorrência
-- tenha sido apagada depois.
ALTER TABLE items ADD COLUMN recorrencia_gerada_ate TEXT;
