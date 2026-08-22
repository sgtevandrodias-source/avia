import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { CategoriaItem, Item, ItemCompartilhadoLocal, NovaCategoria, NovoItem } from '../types/item';

// Cada conta salva neste aparelho tem seu PRÓPRIO arquivo SQLite
// (avia_<usuarioId>.db) — nunca compartilham dados, nem por um instante,
// o que torna a troca de conta instantânea e funcional offline (só dispara
// uma sincronização de atualização em segundo plano depois, ver
// alternarConta em AuthContext.tsx). `definirUsuarioAtivo` precisa ser
// chamado (pelo AuthContext, ao restaurar sessão/logar/trocar de conta)
// antes de qualquer outra função deste módulo ser usada.
let usuarioAtivoId: string | null = null;
let dbAtual: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Quem já usava o AVIA antes desta versão tinha um único arquivo fixo
 * (avia.db, compartilhado por qualquer conta logada no aparelho). Na
 * primeira vez que essa conta específica for ativada depois desta
 * atualização, renomeia esse arquivo único pro nome por-conta dela, uma
 * única vez — preserva o cache/fila pendente de quem já usa o app, em vez
 * de forçar uma ressincronização completa à toa. Falha aqui nunca é grave:
 * na pior hipótese esta conta só começa com cache vazio e resincroniza do
 * zero (ver sincronizar() em sync.ts) — o arquivo antigo nunca é apagado
 * por essa função, só movido, então não há risco de perda de dado.
 */
async function migrarBancoUnicoSeNecessario(usuarioId: string): Promise<boolean> {
  try {
    const antigo = `${SQLite.defaultDatabaseDirectory}avia.db`;
    const novo = `${SQLite.defaultDatabaseDirectory}avia_${usuarioId}.db`;
    const [infoAntigo, infoNovo] = await Promise.all([
      FileSystem.getInfoAsync(antigo),
      FileSystem.getInfoAsync(novo),
    ]);
    if (infoAntigo.exists && !infoNovo.exists) {
      await FileSystem.moveAsync({ from: antigo, to: novo });
      return true;
    }
    return false;
  } catch {
    // Ver comentário acima — nunca bloqueia a abertura do banco por-conta.
    return false;
  }
}

/** Troca qual conta está ativa — chamado pelo AuthContext antes de qualquer leitura/escrita local. */
export function definirUsuarioAtivo(usuarioId: string): void {
  if (usuarioId === usuarioAtivoId) return;
  usuarioAtivoId = usuarioId;
  const paraFechar = dbAtual;
  dbAtual = null;
  dbPromise = null;
  if (paraFechar) {
    paraFechar.closeAsync().catch(() => {});
  }
}

/** Apaga de vez o cache local de uma conta específica (usado ao "remover conta deste aparelho"). */
export async function apagarBancoDaConta(usuarioId: string): Promise<void> {
  // Precisa fechar a conexão ANTES de apagar o arquivo, senão a exclusão
  // pode falhar com o arquivo ainda aberto — por isso aqui fecha e espera
  // de verdade, em vez do fire-and-forget de definirUsuarioAtivo.
  if (usuarioId === usuarioAtivoId) {
    if (dbAtual) await dbAtual.closeAsync().catch(() => {});
    dbAtual = null;
    dbPromise = null;
    usuarioAtivoId = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(`avia_${usuarioId}.db`);
  } catch {
    // Aparelho pode nunca ter tido esse arquivo (conta só existiu em outro
    // aparelho) — nada a fazer.
  }
}

async function adicionarColunaSeNaoExistir(
  db: SQLite.SQLiteDatabase,
  tabela: string,
  coluna: string,
  definicao: string,
): Promise<void> {
  const colunas = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabela})`);
  if (!colunas.some((c) => c.name === coluna)) {
    await db.execAsync(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!usuarioAtivoId) {
    throw new Error('definirUsuarioAtivo precisa ser chamado antes de usar o banco local');
  }
  if (!dbPromise) {
    const usuarioId = usuarioAtivoId;
    dbPromise = migrarBancoUnicoSeNecessario(usuarioId)
      .then((migrado) => SQLite.openDatabaseAsync(`avia_${usuarioId}.db`).then((db) => ({ db, migrado })))
      .then(async ({ db, migrado }) => {
      dbAtual = db;
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY NOT NULL,
          texto_original TEXT NOT NULL,
          titulo TEXT NOT NULL,
          data TEXT NOT NULL,
          hora_compromisso TEXT,
          hora_limite TEXT,
          tipo_horario TEXT NOT NULL DEFAULT 'nenhum',
          categoria TEXT NOT NULL DEFAULT 'outro',
          status TEXT NOT NULL DEFAULT 'pendente',
          recorrencia TEXT NOT NULL DEFAULT 'nenhuma',
          lembrete_offset_dias INTEGER NOT NULL DEFAULT 0,
          criado_em TEXT NOT NULL,
          concluido_em TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_items_data ON items(data);
        CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

        CREATE TABLE IF NOT EXISTS sync_meta (
          chave TEXT PRIMARY KEY NOT NULL,
          valor TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exclusoes_pendentes (
          id TEXT PRIMARY KEY NOT NULL,
          quando TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categorias (
          id TEXT PRIMARY KEY NOT NULL,
          nome TEXT NOT NULL,
          icone TEXT NOT NULL,
          cor TEXT NOT NULL,
          sistema INTEGER NOT NULL DEFAULT 0,
          ordem INTEGER NOT NULL DEFAULT 999,
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS exclusoes_pendentes_categorias (
          id TEXT PRIMARY KEY NOT NULL,
          quando TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS itens_compartilhados (
          id TEXT PRIMARY KEY NOT NULL,
          item_id TEXT NOT NULL,
          papel TEXT NOT NULL,
          criador_nome TEXT NOT NULL,
          destinatario_nome TEXT,
          status TEXT NOT NULL,
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
          atualizado_em TEXT NOT NULL
        );
      `);
      // Migração: bancos criados antes da sincronização não têm atualizado_em.
      await adicionarColunaSeNaoExistir(db, 'items', 'atualizado_em', 'TEXT');
      await db.runAsync(
        `UPDATE items SET atualizado_em = criado_em WHERE atualizado_em IS NULL`,
      );
      // Migração: lembrete deixou de ser só em dias, agora é em minutos (mais granular).
      await adicionarColunaSeNaoExistir(db, 'items', 'lembrete_offset_minutos', 'INTEGER');
      await db.runAsync(
        `UPDATE items SET lembrete_offset_minutos = lembrete_offset_dias * 1440 WHERE lembrete_offset_minutos IS NULL`,
      );
      // Migração: destaque de prioridade (item 3 do round de UI/UX) — tarefas
      // já salvas ficam com prioridade = false (0), sem perder nada.
      await adicionarColunaSeNaoExistir(db, 'items', 'prioridade', 'INTEGER NOT NULL DEFAULT 0');
      // Migração: ordem de exibição das categorias (item 5 do mesmo round).
      await adicionarColunaSeNaoExistir(db, 'categorias', 'ordem', 'INTEGER NOT NULL DEFAULT 999');
      // Migração: id do item raiz da série recorrente (Fase 1) — itens já
      // salvos ficam com NULL, ou seja, cada um é tratado como raiz da sua
      // própria série (comportamento correto pra quem não tinha ocorrências
      // geradas ainda).
      await adicionarColunaSeNaoExistir(db, 'items', 'origem_recorrencia_id', 'TEXT');
      // Migração: bookmark de até onde uma série recorrente já foi gerada
      // (corrige bug de ocorrência apagada "voltar" — ver recorrencia.ts).
      await adicionarColunaSeNaoExistir(db, 'items', 'recorrencia_gerada_ate', 'TEXT');
      // Migração: anotação livre do item (caixinha de notas na edição).
      await adicionarColunaSeNaoExistir(db, 'items', 'notas', 'TEXT');

      if (migrado) {
        // Acabamos de renomear o arquivo único antigo (avia.db) pra este —
        // o cursor de sincronização que veio junto reflete a última vez que
        // ESTE aparelho sincronizou antes desta atualização, que pode ser
        // bem anterior a mudanças feitas no servidor nesse meio-tempo (ex.:
        // a redução de categorias). Um pull incremental a partir desse
        // cursor antigo pode nunca alcançar tudo; zera os cursores uma
        // única vez pra forçar um pull completo, igual uma conta nova faria.
        await db.runAsync(
          `INSERT OR REPLACE INTO sync_meta (chave, valor) VALUES
           ('ultimaSincronizacao', ''),
           ('ultimaSincronizacaoCategorias', ''),
           ('ultimaSincronizacaoCompartilhamentos', '')`,
        );
      }
      return db;
    });
  }
  return dbPromise;
}

interface ItemRow {
  id: string;
  texto_original: string;
  titulo: string;
  data: string;
  hora_compromisso: string | null;
  hora_limite: string | null;
  tipo_horario: Item['tipoHorario'];
  categoria: Item['categoria'];
  status: Item['status'];
  recorrencia: Item['recorrencia'];
  lembrete_offset_minutos: number;
  prioridade: number;
  origem_recorrencia_id: string | null;
  recorrencia_gerada_ate: string | null;
  notas: string | null;
  criado_em: string;
  concluido_em: string | null;
  atualizado_em: string;
}

function rowParaItem(row: ItemRow): Item {
  return {
    id: row.id,
    textoOriginal: row.texto_original,
    titulo: row.titulo,
    data: row.data,
    horaCompromisso: row.hora_compromisso,
    horaLimite: row.hora_limite,
    tipoHorario: row.tipo_horario,
    categoria: row.categoria,
    status: row.status,
    recorrencia: row.recorrencia,
    lembreteOffsetMinutos: row.lembrete_offset_minutos,
    prioridade: row.prioridade === 1,
    origemRecorrenciaId: row.origem_recorrencia_id,
    recorrenciaGeradaAte: row.recorrencia_gerada_ate,
    notas: row.notas,
    criadoEm: row.criado_em,
    concluidoEm: row.concluido_em,
    atualizadoEm: row.atualizado_em,
  };
}

export async function listarItens(): Promise<Item[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ItemRow>(
    'SELECT * FROM items ORDER BY data ASC, hora_compromisso ASC, hora_limite ASC',
  );
  return rows.map(rowParaItem);
}

export async function criarItem(novoItem: NovoItem): Promise<Item> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const item: Item = {
    ...novoItem,
    prioridade: novoItem.prioridade ?? false,
    origemRecorrenciaId: novoItem.origemRecorrenciaId ?? null,
    recorrenciaGeradaAte: null,
    notas: novoItem.notas ?? null,
    id: Crypto.randomUUID(),
    status: 'pendente',
    criadoEm: agora,
    concluidoEm: null,
    atualizadoEm: agora,
  };
  await db.runAsync(
    `INSERT INTO items (
      id, texto_original, titulo, data, hora_compromisso, hora_limite,
      tipo_horario, categoria, status, recorrencia, lembrete_offset_minutos, prioridade, origem_recorrencia_id,
      recorrencia_gerada_ate, notas, criado_em, concluido_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.textoOriginal,
      item.titulo,
      item.data,
      item.horaCompromisso,
      item.horaLimite,
      item.tipoHorario,
      item.categoria,
      item.status,
      item.recorrencia,
      item.lembreteOffsetMinutos,
      item.prioridade ? 1 : 0,
      item.origemRecorrenciaId,
      item.recorrenciaGeradaAte,
      item.notas,
      item.criadoEm,
      item.concluidoEm,
      item.atualizadoEm,
    ],
  );
  return item;
}

export async function atualizarItem(item: Item): Promise<void> {
  const db = await getDb();
  const atualizadoEm = new Date().toISOString();
  await db.runAsync(
    `UPDATE items SET
      texto_original = ?, titulo = ?, data = ?, hora_compromisso = ?, hora_limite = ?,
      tipo_horario = ?, categoria = ?, status = ?, recorrencia = ?, lembrete_offset_minutos = ?, prioridade = ?,
      notas = ?, concluido_em = ?, atualizado_em = ?
    WHERE id = ?`,
    [
      item.textoOriginal,
      item.titulo,
      item.data,
      item.horaCompromisso,
      item.horaLimite,
      item.tipoHorario,
      item.categoria,
      item.status,
      item.recorrencia,
      item.lembreteOffsetMinutos,
      item.prioridade ? 1 : 0,
      item.notas,
      item.concluidoEm,
      atualizadoEm,
      item.id,
    ],
  );
}

/**
 * Bump de `atualizado_em` em toda linha, sem mexer em mais nada — usado só
 * pra forçar o próximo `sincronizar()` a reenviar todo mundo (ex.: depois de
 * configurar a criptografia, pra recifrar e reenviar os itens que já
 * existiam em texto puro). Não passa pelo `atualizarItem`/`ItemsContext`
 * de propósito, pra não disparar reagendamento de notificação por item.
 */
export async function tocarTodosItens(): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE items SET atualizado_em = ?', [new Date().toISOString()]);
}

export async function marcarStatus(id: string, status: Item['status']): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const concluidoEm = status === 'feito' ? agora : null;
  await db.runAsync('UPDATE items SET status = ?, concluido_em = ?, atualizado_em = ? WHERE id = ?', [
    status,
    concluidoEm,
    agora,
    id,
  ]);
}

export async function marcarPrioridade(id: string, prioridade: boolean): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync('UPDATE items SET prioridade = ?, atualizado_em = ? WHERE id = ?', [
    prioridade ? 1 : 0,
    agora,
    id,
  ]);
}

/** Avança o bookmark de recorrência da raiz — nunca deixa ele "voltar" (guarda contra escritas fora de ordem). */
export async function marcarRecorrenciaGeradaAte(id: string, data: string): Promise<void> {
  const db = await getDb();
  const agora = new Date().toISOString();
  await db.runAsync(
    `UPDATE items SET recorrencia_gerada_ate = ?, atualizado_em = ?
     WHERE id = ? AND (recorrencia_gerada_ate IS NULL OR recorrencia_gerada_ate < ?)`,
    [data, agora, id, data],
  );
}

export async function excluirItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
  await db.runAsync('INSERT OR REPLACE INTO exclusoes_pendentes (id, quando) VALUES (?, ?)', [
    id,
    new Date().toISOString(),
  ]);
}

// ---- Suporte à sincronização (Etapa 3) ----

export async function upsertItemLocal(item: Item): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO items (
      id, texto_original, titulo, data, hora_compromisso, hora_limite,
      tipo_horario, categoria, status, recorrencia, lembrete_offset_minutos, prioridade, origem_recorrencia_id,
      recorrencia_gerada_ate, notas, criado_em, concluido_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      texto_original = excluded.texto_original,
      titulo = excluded.titulo,
      data = excluded.data,
      hora_compromisso = excluded.hora_compromisso,
      hora_limite = excluded.hora_limite,
      tipo_horario = excluded.tipo_horario,
      categoria = excluded.categoria,
      status = excluded.status,
      recorrencia = excluded.recorrencia,
      lembrete_offset_minutos = excluded.lembrete_offset_minutos,
      prioridade = excluded.prioridade,
      origem_recorrencia_id = excluded.origem_recorrencia_id,
      recorrencia_gerada_ate = excluded.recorrencia_gerada_ate,
      notas = excluded.notas,
      concluido_em = excluded.concluido_em,
      atualizado_em = excluded.atualizado_em`,
    [
      item.id,
      item.textoOriginal,
      item.titulo,
      item.data,
      item.horaCompromisso,
      item.horaLimite,
      item.tipoHorario,
      item.categoria,
      item.status,
      item.recorrencia,
      item.lembreteOffsetMinutos,
      item.prioridade ? 1 : 0,
      item.origemRecorrenciaId,
      item.recorrenciaGeradaAte,
      item.notas,
      item.criadoEm,
      item.concluidoEm,
      item.atualizadoEm,
    ],
  );
}

export async function removerItemLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}

export async function itensAlteradosDesde(desde: string | null): Promise<Item[]> {
  const db = await getDb();
  const rows = desde
    ? await db.getAllAsync<ItemRow>('SELECT * FROM items WHERE atualizado_em > ?', [desde])
    : await db.getAllAsync<ItemRow>('SELECT * FROM items');
  return rows.map(rowParaItem);
}

export async function listarExclusoesPendentes(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM exclusoes_pendentes');
  return rows.map((r) => r.id);
}

export async function removerExclusaoPendente(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM exclusoes_pendentes WHERE id = ?', [id]);
}

export async function getMeta(chave: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ valor: string }>(
    'SELECT valor FROM sync_meta WHERE chave = ?',
    [chave],
  );
  return row?.valor ?? null;
}

export async function setMeta(chave: string, valor: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO sync_meta (chave, valor) VALUES (?, ?)', [chave, valor]);
}

// ---- Categorias (Fase 3) ----

interface CategoriaRow {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  sistema: number;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
}

function rowParaCategoria(row: CategoriaRow): CategoriaItem {
  return {
    id: row.id,
    nome: row.nome,
    icone: row.icone,
    cor: row.cor,
    sistema: row.sistema === 1,
    ordem: row.ordem,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export async function listarCategorias(): Promise<CategoriaItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoriaRow>('SELECT * FROM categorias ORDER BY ordem ASC, criado_em ASC');
  return rows.map(rowParaCategoria);
}

export async function criarCategoria(nova: NovaCategoria): Promise<CategoriaItem> {
  const db = await getDb();
  const agora = new Date().toISOString();
  const categoria: CategoriaItem = {
    ...nova,
    ordem: nova.ordem ?? 999,
    id: Crypto.randomUUID(),
    criadoEm: agora,
    atualizadoEm: agora,
  };
  await db.runAsync(
    'INSERT INTO categorias (id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [categoria.id, categoria.nome, categoria.icone, categoria.cor, categoria.sistema ? 1 : 0, categoria.ordem, categoria.criadoEm, categoria.atualizadoEm],
  );
  return categoria;
}

export async function atualizarCategoria(categoria: CategoriaItem): Promise<void> {
  const db = await getDb();
  const atualizadoEm = new Date().toISOString();
  await db.runAsync('UPDATE categorias SET nome = ?, icone = ?, cor = ?, atualizado_em = ? WHERE id = ?', [
    categoria.nome,
    categoria.icone,
    categoria.cor,
    atualizadoEm,
    categoria.id,
  ]);
}

export async function excluirCategoria(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM categorias WHERE id = ?', [id]);
  await db.runAsync('INSERT OR REPLACE INTO exclusoes_pendentes_categorias (id, quando) VALUES (?, ?)', [
    id,
    new Date().toISOString(),
  ]);
}

export async function upsertCategoriaLocal(categoria: CategoriaItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO categorias (id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       nome = excluded.nome,
       icone = excluded.icone,
       cor = excluded.cor,
       ordem = excluded.ordem,
       atualizado_em = excluded.atualizado_em`,
    [categoria.id, categoria.nome, categoria.icone, categoria.cor, categoria.sistema ? 1 : 0, categoria.ordem, categoria.criadoEm, categoria.atualizadoEm],
  );
}

export async function removerCategoriaLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM categorias WHERE id = ?', [id]);
}

export async function categoriasAlteradasDesde(desde: string | null): Promise<CategoriaItem[]> {
  const db = await getDb();
  const rows = desde
    ? await db.getAllAsync<CategoriaRow>('SELECT * FROM categorias WHERE atualizado_em > ?', [desde])
    : await db.getAllAsync<CategoriaRow>('SELECT * FROM categorias');
  return rows.map(rowParaCategoria);
}

export async function listarExclusoesPendentesCategorias(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM exclusoes_pendentes_categorias');
  return rows.map((r) => r.id);
}

export async function removerExclusaoPendenteCategoria(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM exclusoes_pendentes_categorias WHERE id = ?', [id]);
}

// ---- Compartilhamento de itens (Fase 8) ----
// Só cache local de leitura — as ações (compartilhar, responder, concluir,
// remover) chamam a API na hora (ver CompartilhamentosContext); aqui só se
// puxa (pull) o que o servidor tem via sync.ts, sem fila de push própria.

interface ItemCompartilhadoRow {
  id: string;
  item_id: string;
  papel: string;
  criador_nome: string;
  destinatario_nome: string | null;
  status: string;
  titulo: string;
  texto_original: string;
  data: string;
  hora_compromisso: string | null;
  hora_limite: string | null;
  tipo_horario: Item['tipoHorario'];
  categoria_nome: string;
  categoria_icone: string;
  categoria_cor: string;
  notas: string | null;
  concluido_pelo_destinatario: number;
  atualizado_em: string;
}

function rowParaItemCompartilhado(row: ItemCompartilhadoRow): ItemCompartilhadoLocal {
  return {
    id: row.id,
    itemId: row.item_id,
    papel: row.papel as ItemCompartilhadoLocal['papel'],
    criadorNome: row.criador_nome,
    destinatarioNome: row.destinatario_nome ?? undefined,
    status: row.status as ItemCompartilhadoLocal['status'],
    titulo: row.titulo,
    textoOriginal: row.texto_original,
    data: row.data,
    horaCompromisso: row.hora_compromisso,
    horaLimite: row.hora_limite,
    tipoHorario: row.tipo_horario,
    categoriaNome: row.categoria_nome,
    categoriaIcone: row.categoria_icone,
    categoriaCor: row.categoria_cor,
    notas: row.notas,
    concluidoPeloDestinatario: row.concluido_pelo_destinatario === 1,
    atualizadoEm: row.atualizado_em,
  };
}

export async function listarItensCompartilhados(): Promise<ItemCompartilhadoLocal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ItemCompartilhadoRow>(
    'SELECT * FROM itens_compartilhados ORDER BY atualizado_em DESC',
  );
  return rows.map(rowParaItemCompartilhado);
}

export async function upsertItemCompartilhadoLocal(item: ItemCompartilhadoLocal): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO itens_compartilhados (
      id, item_id, papel, criador_nome, destinatario_nome, status, titulo, texto_original, data,
      hora_compromisso, hora_limite, tipo_horario, categoria_nome, categoria_icone, categoria_cor,
      notas, concluido_pelo_destinatario, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      papel = excluded.papel,
      criador_nome = excluded.criador_nome,
      destinatario_nome = excluded.destinatario_nome,
      status = excluded.status,
      titulo = excluded.titulo,
      texto_original = excluded.texto_original,
      data = excluded.data,
      hora_compromisso = excluded.hora_compromisso,
      hora_limite = excluded.hora_limite,
      tipo_horario = excluded.tipo_horario,
      categoria_nome = excluded.categoria_nome,
      categoria_icone = excluded.categoria_icone,
      categoria_cor = excluded.categoria_cor,
      notas = excluded.notas,
      concluido_pelo_destinatario = excluded.concluido_pelo_destinatario,
      atualizado_em = excluded.atualizado_em`,
    [
      item.id,
      item.itemId,
      item.papel,
      item.criadorNome,
      item.destinatarioNome ?? null,
      item.status,
      item.titulo,
      item.textoOriginal,
      item.data,
      item.horaCompromisso,
      item.horaLimite,
      item.tipoHorario,
      item.categoriaNome,
      item.categoriaIcone,
      item.categoriaCor,
      item.notas,
      item.concluidoPeloDestinatario ? 1 : 0,
      item.atualizadoEm,
    ],
  );
}

export async function removerItemCompartilhadoLocal(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM itens_compartilhados WHERE id = ?', [id]);
}

// ---- Isolamento entre contas (o SQLite local é único por aparelho, não por usuário) ----

/**
 * Apaga todos os dados locais (items, categorias e filas de exclusão
 * pendente). Usado quando o usuário logado muda pra outro diferente do
 * último — sem isso, dados de uma conta ficariam visíveis/misturados
 * na próxima conta que logar no mesmo aparelho.
 */
export async function limparTudoLocal(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM items;
    DELETE FROM categorias;
    DELETE FROM exclusoes_pendentes;
    DELETE FROM exclusoes_pendentes_categorias;
    DELETE FROM itens_compartilhados;
  `);
}
