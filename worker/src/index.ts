export interface Env {
  DB: D1Database;
  API_KEY: string;
}

interface ItemApi {
  id: string;
  textoOriginal: string;
  titulo: string;
  data: string;
  horaCompromisso: string | null;
  horaLimite: string | null;
  tipoHorario: string;
  categoria: string;
  status: string;
  recorrencia: string;
  lembreteOffsetDias: number;
  criadoEm: string;
  concluidoEm: string | null;
  atualizadoEm: string;
  excluido?: boolean;
}

interface ItemRow {
  id: string;
  texto_original: string;
  titulo: string;
  data: string;
  hora_compromisso: string | null;
  hora_limite: string | null;
  tipo_horario: string;
  categoria: string;
  status: string;
  recorrencia: string;
  lembrete_offset_dias: number;
  criado_em: string;
  concluido_em: string | null;
  atualizado_em: string;
  excluido: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function rowParaApi(row: ItemRow): ItemApi {
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
    atualizadoEm: row.atualizado_em,
    excluido: row.excluido === 1,
  };
}

async function buscarPorId(db: D1Database, id: string): Promise<ItemRow | null> {
  const row = await db.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<ItemRow>();
  return row ?? null;
}

// Upsert com resolucao "last write wins": só grava se o registro não existir
// ou se o timestamp `atualizadoEm` recebido for mais recente (ou igual) que o armazenado.
async function upsertComLWW(db: D1Database, item: ItemApi): Promise<{ item: ItemApi; aplicado: boolean }> {
  const existente = await buscarPorId(db, item.id);
  if (existente && existente.atualizado_em >= item.atualizadoEm) {
    return { item: rowParaApi(existente), aplicado: false };
  }

  await db
    .prepare(
      `INSERT INTO items (
        id, texto_original, titulo, data, hora_compromisso, hora_limite,
        tipo_horario, categoria, status, recorrencia, lembrete_offset_dias,
        criado_em, concluido_em, atualizado_em, excluido
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
        lembrete_offset_dias = excluded.lembrete_offset_dias,
        concluido_em = excluded.concluido_em,
        atualizado_em = excluded.atualizado_em,
        excluido = excluded.excluido`,
    )
    .bind(
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
      item.atualizadoEm,
      item.excluido ? 1 : 0,
    )
    .run();

  return { item, aplicado: true };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const partes = url.pathname.split('/').filter(Boolean); // ["items"] ou ["items", ":id"]

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const chaveRecebida = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!env.API_KEY || chaveRecebida !== env.API_KEY) {
      return json({ erro: 'Não autorizado' }, 401);
    }

    if (partes[0] !== 'items') {
      return json({ erro: 'Rota não encontrada' }, 404);
    }

    const id = partes[1];

    try {
      // GET /items  ou  GET /items?since=ISO
      if (request.method === 'GET' && !id) {
        const since = url.searchParams.get('since');
        const stmt = since
          ? env.DB.prepare('SELECT * FROM items WHERE atualizado_em > ? ORDER BY atualizado_em ASC').bind(since)
          : env.DB.prepare('SELECT * FROM items WHERE excluido = 0 ORDER BY data ASC');
        const { results } = await stmt.all<ItemRow>();
        return json(results.map(rowParaApi));
      }

      // GET /items/:id
      if (request.method === 'GET' && id) {
        const row = await buscarPorId(env.DB, id);
        if (!row) return json({ erro: 'Item não encontrado' }, 404);
        return json(rowParaApi(row));
      }

      // POST /items  (upsert; usa o id do corpo)
      if (request.method === 'POST' && !id) {
        const item = (await request.json()) as ItemApi;
        if (!item.id || !item.atualizadoEm) {
          return json({ erro: 'id e atualizadoEm são obrigatórios' }, 400);
        }
        const resultado = await upsertComLWW(env.DB, item);
        return json(resultado.item, resultado.aplicado ? 200 : 409);
      }

      // PUT /items/:id  (upsert; usa o id da URL)
      if (request.method === 'PUT' && id) {
        const corpo = (await request.json()) as ItemApi;
        const item: ItemApi = { ...corpo, id };
        if (!item.atualizadoEm) {
          return json({ erro: 'atualizadoEm é obrigatório' }, 400);
        }
        const resultado = await upsertComLWW(env.DB, item);
        return json(resultado.item, resultado.aplicado ? 200 : 409);
      }

      // DELETE /items/:id  (soft delete, propaga na sincronização)
      if (request.method === 'DELETE' && id) {
        const agora = new Date().toISOString();
        await env.DB.prepare('UPDATE items SET excluido = 1, atualizado_em = ? WHERE id = ?')
          .bind(agora, id)
          .run();
        return json({ ok: true });
      }

      return json({ erro: 'Método não suportado' }, 405);
    } catch (erro) {
      return json({ erro: 'Erro interno', detalhe: String(erro) }, 500);
    }
  },
};
