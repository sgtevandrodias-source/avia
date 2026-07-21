CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY NOT NULL,
  texto_original TEXT NOT NULL,
  titulo TEXT NOT NULL,
  data TEXT NOT NULL,
  hora_compromisso TEXT,
  hora_limite TEXT,
  tipo_horario TEXT NOT NULL DEFAULT 'nenhum', -- 'nenhum' | 'compromisso' | 'prazo' | 'dia_todo'
  categoria TEXT NOT NULL DEFAULT 'outro',
  status TEXT NOT NULL DEFAULT 'pendente',
  recorrencia TEXT NOT NULL DEFAULT 'nenhuma', -- 'nenhuma' | 'diaria' | 'semanal' | 'mensal' | 'anual' (só metadado, sem motor de repetição)
  lembrete_offset_dias INTEGER NOT NULL DEFAULT 0, -- legado, ver migration 0004 (lembrete_offset_minutos)
  lembrete_offset_minutos INTEGER NOT NULL DEFAULT 0,
  prioridade INTEGER NOT NULL DEFAULT 0, -- ver migration 0005
  origem_recorrencia_id TEXT, -- ver migration 0008: id do item raiz da série recorrente
  criado_em TEXT NOT NULL,
  concluido_em TEXT,
  atualizado_em TEXT NOT NULL,
  excluido INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_items_atualizado_em ON items(atualizado_em);
