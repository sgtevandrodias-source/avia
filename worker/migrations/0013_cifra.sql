-- Envelope de criptografia ponta a ponta (opcional, por usuário). O Worker só
-- guarda blobs opacos (DEK cifrada por senha e por código de recuperação) e
-- os salts/parâmetros do PBKDF2 — nunca a frase, o código ou a chave em si.
-- A existência da linha indica que o usuário configurou a criptografia.
CREATE TABLE IF NOT EXISTS cifra_usuario (
  usuario_id TEXT PRIMARY KEY NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  kdf_iteracoes INTEGER NOT NULL,
  salt_senha TEXT NOT NULL,
  dek_cifrada_por_senha TEXT NOT NULL,
  salt_recuperacao TEXT NOT NULL,
  dek_cifrada_por_recuperacao TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
