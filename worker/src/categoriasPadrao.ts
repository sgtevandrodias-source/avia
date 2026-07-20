// Lista e ordem atualizadas: Trabalho, Pessoal, Família, Casa, Saúde, Estudos,
// Finanças, Lazer, Aniversário, Diversos. Os ids abaixo são os mesmos usados
// na migração 0007 pra usuários já existentes — mantém tudo consistente entre
// quem já tinha conta e quem se cadastra agora.
export const CATEGORIAS_PADRAO = [
  { id: 'trabalho', nome: 'Trabalho', icone: '💼', cor: '#4C9AFF', ordem: 0 },
  { id: 'pessoal', nome: 'Pessoal', icone: '🏠', cor: '#F5A623', ordem: 1 },
  { id: 'familia', nome: 'Família', icone: '👨‍👩‍👧', cor: '#FF8B94', ordem: 2 },
  { id: 'casa', nome: 'Casa', icone: '🏡', cor: '#6FCF97', ordem: 3 },
  { id: 'saude', nome: 'Saúde', icone: '⚕️', cor: '#2BB3A3', ordem: 4 },
  { id: 'estudos', nome: 'Estudos', icone: '📚', cor: '#56CCF2', ordem: 5 },
  { id: 'compromisso_fixo', nome: 'Finanças', icone: '📌', cor: '#7A8CA3', ordem: 6 },
  { id: 'social', nome: 'Lazer', icone: '🎉', cor: '#B084F5', ordem: 7 },
  { id: 'aniversario', nome: 'Aniversário', icone: '🎂', cor: '#E85D9C', ordem: 8 },
  { id: 'outro', nome: 'Diversos', icone: '•', cor: '#9AA3AF', ordem: 9 },
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
