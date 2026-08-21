-- Expo Push Tokens por aparelho (ver src/notifications/pushToken.ts). Chave
-- é o próprio token, não o usuario_id: um usuário pode ter vários aparelhos
-- (vários tokens), e se o mesmo aparelho for usado depois por outra conta, o
-- upsert seguinte simplesmente troca o dono desse token — sem precisar de
-- lógica de "desregistrar" no logout.
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY NOT NULL,
  usuario_id TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_usuario ON push_tokens(usuario_id);
