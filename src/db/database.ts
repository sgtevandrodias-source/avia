import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { CategoriaItem, Item, NovaCategoria, NovoItem } from '../types/item';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('avia.db').then(async (db) => {
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
    id: Crypto.randomUUID(),
    status: 'pendente',
    criadoEm: agora,
    concluidoEm: null,
    atualizadoEm: agora,
  };
  await db.runAsync(
    `INSERT INTO items (
      id, texto_original, titulo, data, hora_compromisso, hora_limite,
      tipo_horario, categoria, status, recorrencia, lembrete_offset_minutos, prioridade, criado_em, concluido_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      concluido_em = ?, atualizado_em = ?
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
      item.concluidoEm,
      atualizadoEm,
      item.id,
    ],
  );
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
      tipo_horario, categoria, status, recorrencia, lembrete_offset_minutos, prioridade, criado_em, concluido_em, atualizado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  `);
}
