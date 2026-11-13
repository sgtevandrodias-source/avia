-- Transferência de tarefas entre contas (ver src/transferencias.ts).
-- Diferente do compartilhamento: depois de aceita, a tarefa passa a PERTENCER
-- ao destino (items.usuario_id muda) e sai da conta de origem.
-- Migração só aditiva: três tabelas novas, nada existente é alterado.

CREATE TABLE IF NOT EXISTS transferencias (
  id TEXT PRIMARY KEY NOT NULL,
  de_usuario_id TEXT NOT NULL,
  para_usuario_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- 'pendente' | 'aceita' | 'recusada' | 'cancelada' | 'expirada'
  criado_em TEXT NOT NULL,
  respondido_em TEXT,
  expira_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transferencias_de ON transferencias(de_usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_transferencias_para ON transferencias(para_usuario_id, status);

-- Tarefas de cada transferência. "movido" = 1 só nas que de fato mudaram de
-- dono no aceite (uma tarefa apagada pela origem enquanto esperava fica 0).
CREATE TABLE IF NOT EXISTS transferencia_itens (
  transferencia_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  movido INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (transferencia_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_transferencia_itens_item ON transferencia_itens(item_id);

-- "Esta tarefa saiu da sua conta": é o que faz os aparelhos da ORIGEM
-- apagarem a tarefa transferida. Na sincronização (GET /items?since=), cada
-- linha aqui vira um item com excluido = true — o mesmo caminho de uma
-- exclusão comum, então até versões antigas do app já entendem.
CREATE TABLE IF NOT EXISTS itens_transferidos (
  item_id TEXT NOT NULL,
  de_usuario_id TEXT NOT NULL,
  transferido_em TEXT NOT NULL,
  PRIMARY KEY (item_id, de_usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_itens_transferidos_usuario ON itens_transferidos(de_usuario_id, transferido_em);
