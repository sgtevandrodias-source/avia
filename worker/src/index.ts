import { criarJwt, hashSenha, verificarGoogleIdToken, verificarJwt, verificarSenha } from './auth';

export interface Env {
  DB: D1Database;
  API_KEY: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
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
  usuario_id: string;
}

interface UsuarioRow {
  id: string;
  email: string;
  nome: string;
  senha_hash: string | null;
  google_sub: string | null;
  criado_em: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function usuarioParaApi(row: UsuarioRow) {
  return { id: row.id, email: row.email, nome: row.nome };
}

async function buscarPorId(db: D1Database, id: string, usuarioId: string): Promise<ItemRow | null> {
  const row = await db
    .prepare('SELECT * FROM items WHERE id = ? AND usuario_id = ?')
    .bind(id, usuarioId)
    .first<ItemRow>();
  return row ?? null;
}

// Upsert com resolucao "last write wins": só grava se o registro não existir
// ou se o timestamp `atualizadoEm` recebido for mais recente (ou igual) que o armazenado.
async function upsertComLWW(
  db: D1Database,
  item: ItemApi,
  usuarioId: string,
): Promise<{ item: ItemApi; aplicado: boolean }> {
  const existente = await buscarPorId(db, item.id, usuarioId);
  if (existente && existente.atualizado_em >= item.atualizadoEm) {
    return { item: rowParaApi(existente), aplicado: false };
  }

  await db
    .prepare(
      `INSERT INTO items (
        id, texto_original, titulo, data, hora_compromisso, hora_limite,
        tipo_horario, categoria, status, recorrencia, lembrete_offset_dias,
        criado_em, concluido_em, atualizado_em, excluido, usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        excluido = excluded.excluido
      WHERE items.usuario_id = ?`,
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
      usuarioId,
      usuarioId,
    )
    .run();

  return { item, aplicado: true };
}

async function autenticar(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  // Fallback administrativo: a API_KEY antiga continua funcionando, escopada
  // no usuario "legado" (dados de antes da autenticacao existir).
  if (env.API_KEY && token === env.API_KEY) return 'legado';

  const payload = await verificarJwt(token, env.JWT_SECRET);
  return payload?.sub ?? null;
}

async function tratarAuth(request: Request, env: Env, rota: string): Promise<Response> {
  if (rota === 'registrar' && request.method === 'POST') {
    const { email, senha, nome } = (await request.json()) as { email?: string; senha?: string; nome?: string };
    if (!email || !senha || !nome) {
      return json({ erro: 'email, senha e nome são obrigatórios' }, 400);
    }
    const existente = await env.DB.prepare('SELECT id FROM usuarios WHERE email = ?').bind(email).first();
    if (existente) return json({ erro: 'E-mail já cadastrado' }, 409);

    const id = crypto.randomUUID();
    const senhaHash = await hashSenha(senha);
    await env.DB.prepare(
      'INSERT INTO usuarios (id, email, nome, senha_hash, google_sub, criado_em) VALUES (?, ?, ?, ?, NULL, ?)',
    )
      .bind(id, email, nome, senhaHash, new Date().toISOString())
      .run();

    const token = await criarJwt({ sub: id, email, nome }, env.JWT_SECRET);
    return json({ token, usuario: { id, email, nome } });
  }

  if (rota === 'login' && request.method === 'POST') {
    const { email, senha } = (await request.json()) as { email?: string; senha?: string };
    if (!email || !senha) return json({ erro: 'email e senha são obrigatórios' }, 400);

    const usuario = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ?').bind(email).first<UsuarioRow>();
    if (!usuario || !usuario.senha_hash) return json({ erro: 'E-mail ou senha inválidos' }, 401);

    const senhaOk = await verificarSenha(senha, usuario.senha_hash);
    if (!senhaOk) return json({ erro: 'E-mail ou senha inválidos' }, 401);

    const token = await criarJwt({ sub: usuario.id, email: usuario.email, nome: usuario.nome }, env.JWT_SECRET);
    return json({ token, usuario: usuarioParaApi(usuario) });
  }

  if (rota === 'google' && request.method === 'POST') {
    const { idToken } = (await request.json()) as { idToken?: string };
    if (!idToken) return json({ erro: 'idToken é obrigatório' }, 400);

    const payload = await verificarGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID);
    if (!payload) return json({ erro: 'idToken inválido' }, 401);

    let usuario = await env.DB.prepare('SELECT * FROM usuarios WHERE google_sub = ?')
      .bind(payload.sub)
      .first<UsuarioRow>();

    if (!usuario) {
      // Se já existir conta com esse e-mail (criada via senha), vincula o Google a ela.
      usuario = await env.DB.prepare('SELECT * FROM usuarios WHERE email = ?').bind(payload.email).first<UsuarioRow>();
      if (usuario) {
        await env.DB.prepare('UPDATE usuarios SET google_sub = ? WHERE id = ?').bind(payload.sub, usuario.id).run();
      } else {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO usuarios (id, email, nome, senha_hash, google_sub, criado_em) VALUES (?, ?, ?, NULL, ?, ?)',
        )
          .bind(id, payload.email, payload.name, payload.sub, new Date().toISOString())
          .run();
        usuario = { id, email: payload.email, nome: payload.name, senha_hash: null, google_sub: payload.sub, criado_em: '' };
      }
    }

    const token = await criarJwt({ sub: usuario.id, email: usuario.email, nome: usuario.nome }, env.JWT_SECRET);
    return json({ token, usuario: usuarioParaApi(usuario) });
  }

  return json({ erro: 'Rota de autenticação não encontrada' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const partes = url.pathname.split('/').filter(Boolean);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // /auth/* não exige token — é o próprio login/cadastro.
      if (partes[0] === 'auth') {
        return await tratarAuth(request, env, partes[1]);
      }

      const usuarioId = await autenticar(request, env);
      if (!usuarioId) {
        return json({ erro: 'Não autorizado' }, 401);
      }

      if (partes[0] !== 'items') {
        return json({ erro: 'Rota não encontrada' }, 404);
      }

      const id = partes[1];

      // GET /items  ou  GET /items?since=ISO
      if (request.method === 'GET' && !id) {
        const since = url.searchParams.get('since');
        const stmt = since
          ? env.DB.prepare('SELECT * FROM items WHERE usuario_id = ? AND atualizado_em > ? ORDER BY atualizado_em ASC').bind(
              usuarioId,
              since,
            )
          : env.DB.prepare('SELECT * FROM items WHERE usuario_id = ? AND excluido = 0 ORDER BY data ASC').bind(
              usuarioId,
            );
        const { results } = await stmt.all<ItemRow>();
        return json(results.map(rowParaApi));
      }

      // GET /items/:id
      if (request.method === 'GET' && id) {
        const row = await buscarPorId(env.DB, id, usuarioId);
        if (!row) return json({ erro: 'Item não encontrado' }, 404);
        return json(rowParaApi(row));
      }

      // POST /items  (upsert; usa o id do corpo)
      if (request.method === 'POST' && !id) {
        const item = (await request.json()) as ItemApi;
        if (!item.id || !item.atualizadoEm) {
          return json({ erro: 'id e atualizadoEm são obrigatórios' }, 400);
        }
        const resultado = await upsertComLWW(env.DB, item, usuarioId);
        return json(resultado.item, resultado.aplicado ? 200 : 409);
      }

      // PUT /items/:id  (upsert; usa o id da URL)
      if (request.method === 'PUT' && id) {
        const corpo = (await request.json()) as ItemApi;
        const item: ItemApi = { ...corpo, id };
        if (!item.atualizadoEm) {
          return json({ erro: 'atualizadoEm é obrigatório' }, 400);
        }
        const resultado = await upsertComLWW(env.DB, item, usuarioId);
        return json(resultado.item, resultado.aplicado ? 200 : 409);
      }

      // DELETE /items/:id  (soft delete, propaga na sincronização)
      if (request.method === 'DELETE' && id) {
        const agora = new Date().toISOString();
        await env.DB.prepare('UPDATE items SET excluido = 1, atualizado_em = ? WHERE id = ? AND usuario_id = ?')
          .bind(agora, id, usuarioId)
          .run();
        return json({ ok: true });
      }

      return json({ erro: 'Método não suportado' }, 405);
    } catch (erro) {
      return json({ erro: 'Erro interno', detalhe: String(erro) }, 500);
    }
  },
};
