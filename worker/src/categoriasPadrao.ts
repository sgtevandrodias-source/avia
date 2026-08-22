// Lista reduzida a 4 categorias fixas: Pessoal, Trabalho, Diversos e
// Aniversário. Os ids abaixo são os mesmos usados na migração 0017 pra
// usuários já existentes — mantém tudo consistente entre quem já tinha
// conta e quem se cadastra agora.
export const CATEGORIAS_PADRAO = [
  { id: 'pessoal', nome: 'Pessoal', icone: '🏠', cor: '#F5A623', ordem: 0 },
  { id: 'trabalho', nome: 'Trabalho', icone: '💼', cor: '#4C9AFF', ordem: 1 },
  { id: 'outro', nome: 'Diversos', icone: '•', cor: '#9AA3AF', ordem: 2 },
  { id: 'aniversario', nome: 'Aniversário', icone: '🎂', cor: '#E85D9C', ordem: 3 },
] as const;

/** Roda no primeiro login/cadastro de cada usuario — cria as categorias padrao dele. */
export async function semearCategoriasPadrao(db: D1Database, usuarioId: string): Promise<void> {
  const agora = new Date().toISOString();
  for (const cat of CATEGORIAS_PADRAO) {
    await db
      .prepare(
        `INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em, excluido)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 0)
         ON CONFLICT(id, usuario_id) DO NOTHING`,
      )
      .bind(cat.id, usuarioId, cat.nome, cat.icone, cat.cor, cat.ordem, agora, agora)
      .run();
  }
}
