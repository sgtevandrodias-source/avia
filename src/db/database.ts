import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import type { Item, NovoItem } from '../types/item';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

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
      `);
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
  lembrete_offset_dias: number;
  criado_em: string;
  concluido_em: string | null;
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
    lembreteOffsetDias: row.lembrete_offset_dias,
    criadoEm: row.criado_em,
    concluidoEm: row.concluido_em,
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
  const item: Item = {
    ...novoItem,
    id: Crypto.randomUUID(),
    status: 'pendente',
    criadoEm: new Date().toISOString(),
    concluidoEm: null,
  };
  await db.runAsync(
    `INSERT INTO items (
      id, texto_original, titulo, data, hora_compromisso, hora_limite,
      tipo_horario, categoria, status, recorrencia, lembrete_offset_dias, criado_em, concluido_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      item.lembreteOffsetDias,
      item.criadoEm,
      item.concluidoEm,
    ],
  );
  return item;
}

export async function atualizarItem(item: Item): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE items SET
      texto_original = ?, titulo = ?, data = ?, hora_compromisso = ?, hora_limite = ?,
      tipo_horario = ?, categoria = ?, status = ?, recorrencia = ?, lembrete_offset_dias = ?, concluido_em = ?
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
      item.lembreteOffsetDias,
      item.concluidoEm,
      item.id,
    ],
  );
}

export async function marcarStatus(id: string, status: Item['status']): Promise<void> {
  const db = await getDb();
  const concluidoEm = status === 'feito' ? new Date().toISOString() : null;
  await db.runAsync('UPDATE items SET status = ?, concluido_em = ? WHERE id = ?', [
    status,
    concluidoEm,
    id,
  ]);
}

export async function excluirItem(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM items WHERE id = ?', [id]);
}
