-- Compartilhamento de um item com outro usuário do Avia. Como cada conta tem
-- sua própria DEK (ver worker/migrations/0013_cifra.sql), o servidor nunca
-- consegue ler titulo/notas de um item cifrado — por isso aqui não guardamos
-- uma referência ao item original, e sim um SNAPSHOT dos campos já
-- decifrados no aparelho de quem compartilha, no momento em que compartilha.
-- Editar o item original depois não atualiza o compartilhamento sozinho;
-- precisa reenviar (ver rota POST /compartilhamentos, que faz upsert).
CREATE TABLE IF NOT EXISTS compartilhamentos (
  id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT NOT NULL,
  criador_id TEXT NOT NULL,
  criador_nome TEXT NOT NULL,
  destinatario_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'aceito' | 'recusado'
  titulo TEXT NOT NULL,
  texto_original TEXT NOT NULL,
  data TEXT NOT NULL,
  hora_compromisso TEXT,
  hora_limite TEXT,
  tipo_horario TEXT NOT NULL,
  categoria_nome TEXT NOT NULL,
  categoria_icone TEXT NOT NULL,
  categoria_cor TEXT NOT NULL,
  notas TEXT,
  concluido_pelo_destinatario INTEGER NOT NULL DEFAULT 0,
  -- Soft delete (mesmo padrão de items/categorias, ver migrations
  -- 0001/0003): sem isso, quem excluir um compartilhamento nunca
  -- propagaria essa remoção pro sync incremental (?since=) do outro lado —
  -- foi exatamente essa classe de bug que causava exclusões "fantasma" em
  -- items antes da correção do cursor de sincronização.
  excluido INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  UNIQUE(item_id, destinatario_id)
);

CREATE INDEX IF NOT EXISTS idx_compartilhamentos_destinatario ON compartilhamentos(destinatario_id, atualizado_em);
CREATE INDEX IF NOT EXISTS idx_compartilhamentos_criador ON compartilhamentos(criador_id, item_id);
