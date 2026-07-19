export const CATEGORIAS_PADRAO = [
  { id: 'social', nome: 'Social', icone: '🎉', cor: '#B084F5' },
  { id: 'trabalho', nome: 'Trabalho', icone: '💼', cor: '#4C9AFF' },
  { id: 'pessoal', nome: 'Pessoal', icone: '🏠', cor: '#F5A623' },
  { id: 'saude', nome: 'Saúde', icone: '⚕️', cor: '#2BB3A3' },
  { id: 'compromisso_fixo', nome: 'Compromisso fixo', icone: '📌', cor: '#7A8CA3' },
  { id: 'aniversario', nome: 'Aniversário', icone: '🎂', cor: '#E85D9C' },
  { id: 'outro', nome: 'Outro', icone: '•', cor: '#9AA3AF' },
] as const;

/** Roda no primeiro login/cadastro de cada usuario — cria as categorias padrao dele. */
export async function semearCategoriasPadrao(db: D1Database, usuarioId: string): Promise<void> {
  const agora = new Date().toISOString();
  for (const cat of CATEGORIAS_PADRAO) {
    await db
      .prepare(
        `INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, criado_em, atualizado_em, excluido)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0)
         ON CONFLICT(id, usuario_id) DO NOTHING`,
      )
      .bind(cat.id, usuarioId, cat.nome, cat.icone, cat.cor, agora, agora)
      .run();
  }
}
