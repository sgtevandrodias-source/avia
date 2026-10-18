-- "Avia que alivia!": título de cada registro (ver worker/src/pensamentos.ts).
-- Migração SÓ ADITIVA: uma coluna nova, com valor padrão, nas duas tabelas
-- criadas em 0018 — registros já existentes ficam com título vazio ("Sem
-- título" no app) e nada mais muda. Assim como `texto`, o título pode vir
-- cifrado pelo aparelho (prefixo AVIA1:) quando a criptografia está ativa.
ALTER TABLE pensamentos ADD COLUMN titulo TEXT NOT NULL DEFAULT '';
ALTER TABLE pensamentos_compartilhados ADD COLUMN titulo TEXT NOT NULL DEFAULT '';
