-- Sustentabilidade do banco + fim da recorrência triplicando entre aparelhos:
-- a regra de uma série recorrente (título, categoria, horários, e o bookmark
-- recorrencia_gerada_ate) vira um registro PRÓPRIO, desacoplado dos itens que
-- ela gera. Antes, esse bookmark ficava espalhado em "qualquer item
-- sobrevivente da série" dentro de items (ver migration 0009) — frágil, e
-- incompatível com arquivar/apagar ocorrências antigas mais tarde (podia
-- perder o bookmark junto). Com a regra numa tabela própria, arquivar
-- ocorrências concluídas nunca mais arrisca o estado da série.
--
-- Truque de migração: o id da série É o id do item raiz original (o primeiro
-- criado manualmente). Como items.origem_recorrencia_id já aponta pro id da
-- raiz em todo item existente, NENHUM dado em items precisa ser reescrito —
-- o ponteiro que já existe passa a apontar pra série automaticamente.
CREATE TABLE IF NOT EXISTS series_recorrentes (
  id TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto_original TEXT NOT NULL,
  categoria TEXT NOT NULL,
  tipo_horario TEXT NOT NULL DEFAULT 'nenhum',
  hora_compromisso TEXT,
  hora_limite TEXT,
  recorrencia TEXT NOT NULL,
  lembrete_offset_minutos INTEGER NOT NULL DEFAULT 0,
  prioridade INTEGER NOT NULL DEFAULT 0,
  ativa INTEGER NOT NULL DEFAULT 1,
  recorrencia_gerada_ate TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_series_usuario_id ON series_recorrentes(usuario_id);

-- Semeia series_recorrentes com toda série já existente: a raiz é o item com
-- recorrencia != 'nenhuma' e origem_recorrencia_id NULL (definição de raiz em
-- src/utils/recorrencia.ts::raizDaSerie). O bookmark inicial é o maior
-- recorrencia_gerada_ate encontrado entre a raiz e suas ocorrências.
INSERT INTO series_recorrentes (
  id, usuario_id, titulo, texto_original, categoria, tipo_horario,
  hora_compromisso, hora_limite, recorrencia, lembrete_offset_minutos,
  prioridade, ativa, recorrencia_gerada_ate, criado_em, atualizado_em
)
SELECT
  raiz.id,
  raiz.usuario_id,
  raiz.titulo,
  raiz.texto_original,
  raiz.categoria,
  raiz.tipo_horario,
  raiz.hora_compromisso,
  raiz.hora_limite,
  raiz.recorrencia,
  raiz.lembrete_offset_minutos,
  raiz.prioridade,
  1,
  (
    SELECT MAX(m.recorrencia_gerada_ate)
    FROM items m
    WHERE (m.id = raiz.id OR m.origem_recorrencia_id = raiz.id)
      AND m.recorrencia_gerada_ate IS NOT NULL
  ),
  raiz.criado_em,
  raiz.atualizado_em
FROM items raiz
WHERE raiz.recorrencia != 'nenhuma' AND raiz.origem_recorrencia_id IS NULL;

-- Limpa as triplicatas que JÁ EXISTEM hoje (o próprio bug relatado — ex.:
-- "verificar sistema de medalhas" aparecendo 3x). Precisa rodar ANTES de
-- criar o índice único logo abaixo: o SQLite recusa criar um índice único
-- sobre dados que já violam a unicidade. Mantém, de cada grupo
-- usuário+série+data, a ocorrência criada primeiro (criado_em mais antigo)
-- e marca as demais como excluídas — soft delete, o mesmo mecanismo usado
-- em qualquer exclusão nesse app, então nada é perdido de verdade (só some
-- da lista do usuário, igual apagar manualmente).
UPDATE items
SET excluido = 1, atualizado_em = datetime('now')
WHERE excluido = 0
  AND id IN (
    SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY usuario_id, COALESCE(origem_recorrencia_id, id), data
               ORDER BY criado_em ASC, id ASC
             ) AS rn
      FROM items
      WHERE excluido = 0
    )
    WHERE rn > 1
  );

-- Rede de segurança contra duplicata (a causa real da triplicação, daqui pra
-- frente): nunca mais que UM item por usuário+série+data pode existir.
-- serie_chave é mantida explicitamente pelo Worker a cada insert/update
-- (COALESCE de origem_recorrencia_id com o próprio id) — não é coluna
-- gerada, pra evitar depender de suporte a GENERATED ALWAYS AS no D1.
ALTER TABLE items ADD COLUMN serie_chave TEXT;
UPDATE items SET serie_chave = COALESCE(origem_recorrencia_id, id) WHERE serie_chave IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_serie_unica
  ON items(usuario_id, serie_chave, data)
  WHERE excluido = 0;
