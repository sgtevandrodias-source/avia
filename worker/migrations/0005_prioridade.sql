-- Destaque de prioridade nos itens (round de UI/UX): tarefas já salvas ficam
-- com prioridade = 0 (false), sem perder nada. Não afeta ordenação por horário.
ALTER TABLE items ADD COLUMN prioridade INTEGER NOT NULL DEFAULT 0;
