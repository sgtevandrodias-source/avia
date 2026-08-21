import { criarJwt, hashSenha, verificarGoogleIdToken, verificarJwt, verificarSenha } from './auth';
import { semearCategoriasPadrao } from './categoriasPadrao';
import { gerarOcorrenciasPendentesNoServidor } from './recorrencia';
import { arquivarItensAntigos } from './arquivamento';

export interface Env {
  DB: D1Database;
  ARQUIVO: R2Bucket;
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
  lembreteOffsetMinutos: number;
  prioridade: boolean;
  origemRecorrenciaId: string | null;
  recorrenciaGeradaAte: string | null;
  notas: string | null;
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
  lembrete_offset_minutos: number;
  prioridade: number;
  origem_recorrencia_id: string | null;
  recorrencia_gerada_ate: string | null;
  notas: string | null;
  criado_em: string;
  concluido_em: string | null;
  atualizado_em: string;
  excluido: number;
  usuario_id: string;
  serie_chave: string;
}

interface UsuarioRow {
  id: string;
  email: string;
  nome: string;
  senha_hash: string | null;
  google_sub: string | null;
  criado_em: string;
}

// Envelope de criptografia ponta a ponta (ver worker/migrations/0013_cifra.sql).
// O Worker nunca vê a frase-senha, o código de recuperação nem a DEK em si —
// só guarda os blobs já cifrados pelo cliente e os salts do PBKDF2.
interface CifraRow {
  versao: number;
  kdf_iteracoes: number;
  salt_senha: string;
  dek_cifrada_por_senha: string;
  salt_recuperacao: string;
  dek_cifrada_por_recuperacao: string;
}

interface CifraApi {
  versao: number;
  kdfIteracoes: number;
  saltSenha: string;
  dekCifradaPorSenha: string;
  saltRecuperacao: string;
  dekCifradaPorRecuperacao: string;
}

interface CategoriaApi {
  id: string;
  nome: string;
  icone: string;
  cor: string;
  sistema: boolean;
  ordem: number;
  criadoEm: string;
  atualizadoEm: string;
  excluido?: boolean;
}

interface CategoriaRow {
  id: string;
  usuario_id: string;
  nome: string;
  icone: string;
  cor: string;
  sistema: number;
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  excluido: number;
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
    lembreteOffsetMinutos: row.lembrete_offset_minutos,
    prioridade: row.prioridade === 1,
    origemRecorrenciaId: row.origem_recorrencia_id,
    recorrenciaGeradaAte: row.recorrencia_gerada_ate,
    notas: row.notas,
    criadoEm: row.criado_em,
    concluidoEm: row.concluido_em,
    atualizadoEm: row.atualizado_em,
    excluido: row.excluido === 1,
  };
}

function usuarioParaApi(row: UsuarioRow) {
  return { id: row.id, email: row.email, nome: row.nome };
}

function categoriaRowParaApi(row: CategoriaRow): CategoriaApi {
  return {
    id: row.id,
    nome: row.nome,
    icone: row.icone,
    cor: row.cor,
    sistema: row.sistema === 1,
    ordem: row.ordem,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    excluido: row.excluido === 1,
  };
}

async function buscarCategoriaPorId(db: D1Database, id: string, usuarioId: string): Promise<CategoriaRow | null> {
  const row = await db
    .prepare('SELECT * FROM categorias WHERE id = ? AND usuario_id = ?')
    .bind(id, usuarioId)
    .first<CategoriaRow>();
  return row ?? null;
}

async function upsertCategoriaComLWW(
  db: D1Database,
  categoria: CategoriaApi,
  usuarioId: string,
): Promise<{ categoria: CategoriaApi; aplicado: boolean }> {
  const existente = await buscarCategoriaPorId(db, categoria.id, usuarioId);
  if (existente && existente.atualizado_em >= categoria.atualizadoEm) {
    return { categoria: categoriaRowParaApi(existente), aplicado: false };
  }

  await db
    .prepare(
      `INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em, excluido)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, usuario_id) DO UPDATE SET
         nome = excluded.nome,
         icone = excluded.icone,
         cor = excluded.cor,
         ordem = excluded.ordem,
         atualizado_em = excluded.atualizado_em,
         excluido = excluded.excluido`,
    )
    .bind(
      categoria.id,
      usuarioId,
      categoria.nome,
      categoria.icone,
      categoria.cor,
      existente?.sistema ? 1 : categoria.sistema ? 1 : 0,
      categoria.ordem ?? existente?.ordem ?? 999,
      categoria.criadoEm,
      categoria.atualizadoEm,
      categoria.excluido ? 1 : 0,
    )
    .run();

  return { categoria, aplicado: true };
}

async function buscarPorId(db: D1Database, id: string, usuarioId: string): Promise<ItemRow | null> {
  const row = await db
    .prepare('SELECT * FROM items WHERE id = ? AND usuario_id = ?')
    .bind(id, usuarioId)
    .first<ItemRow>();
  return row ?? null;
}

/**
 * Mantém series_recorrentes em dia sempre que o item sincronizado é a RAIZ
 * de uma série (origemRecorrenciaId vazio — ver raizDaSerie no cliente).
 * Se a raiz tem recorrência, garante/atualiza a série (título, categoria,
 * horários — o que o usuário editar na raiz passa a valer pras próximas
 * ocorrências geradas). Se a recorrência foi desligada na raiz, desativa a
 * série (para de gerar novas ocorrências, sem apagar as que já existem).
 * Nunca mexe em recorrencia_gerada_ate aqui — esse bookmark é propriedade
 * exclusiva de gerarOcorrenciasPendentesNoServidor.
 */
async function sincronizarSerieDaRaiz(db: D1Database, item: ItemApi, usuarioId: string): Promise<void> {
  if (item.origemRecorrenciaId) return; // não é raiz de série — nada a fazer

  if (item.recorrencia === 'nenhuma') {
    await db
      .prepare('UPDATE series_recorrentes SET ativa = 0, atualizado_em = ? WHERE id = ? AND usuario_id = ?')
      .bind(new Date().toISOString(), item.id, usuarioId)
      .run();
    return;
  }

  const agora = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO series_recorrentes (
        id, usuario_id, titulo, texto_original, categoria, tipo_horario, hora_compromisso, hora_limite,
        recorrencia, lembrete_offset_minutos, prioridade, ativa, recorrencia_gerada_ate, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        titulo = excluded.titulo,
        texto_original = excluded.texto_original,
        categoria = excluded.categoria,
        tipo_horario = excluded.tipo_horario,
        hora_compromisso = excluded.hora_compromisso,
        hora_limite = excluded.hora_limite,
        recorrencia = excluded.recorrencia,
        lembrete_offset_minutos = excluded.lembrete_offset_minutos,
        prioridade = excluded.prioridade,
        ativa = 1,
        atualizado_em = excluded.atualizado_em`,
    )
    .bind(
      item.id,
      usuarioId,
      item.titulo,
      item.textoOriginal,
      item.categoria,
      item.tipoHorario,
      item.horaCompromisso,
      item.horaLimite,
      item.recorrencia,
      item.lembreteOffsetMinutos,
      item.prioridade ? 1 : 0,
      item.criadoEm,
      agora,
    )
    .run();
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

  const serieChave = item.origemRecorrenciaId ?? item.id;

  await db
    .prepare(
      `INSERT INTO items (
        id, texto_original, titulo, data, hora_compromisso, hora_limite,
        tipo_horario, categoria, status, recorrencia, lembrete_offset_minutos, prioridade, origem_recorrencia_id,
        serie_chave, recorrencia_gerada_ate, notas, criado_em, concluido_em, atualizado_em, excluido, usuario_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        serie_chave = excluded.serie_chave,
        recorrencia_gerada_ate = excluded.recorrencia_gerada_ate,
        notas = excluded.notas,
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
      item.lembreteOffsetMinutos,
      item.prioridade ? 1 : 0,
      item.origemRecorrenciaId ?? null,
      serieChave,
      item.recorrenciaGeradaAte ?? null,
      item.notas ?? null,
      item.criadoEm,
      item.concluidoEm,
      item.atualizadoEm,
      item.excluido ? 1 : 0,
      usuarioId,
      usuarioId,
    )
    .run();

  await sincronizarSerieDaRaiz(db, item, usuarioId);

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
    await semearCategoriasPadrao(env.DB, id);

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
        await semearCategoriasPadrao(env.DB, id);
        usuario = { id, email: payload.email, nome: payload.name, senha_hash: null, google_sub: payload.sub, criado_em: '' };
      }
    }

    const token = await criarJwt({ sub: usuario.id, email: usuario.email, nome: usuario.nome }, env.JWT_SECRET);
    return json({ token, usuario: usuarioParaApi(usuario) });
  }

  return json({ erro: 'Rota de autenticação não encontrada' }, 404);
}

async function tratarCategorias(
  request: Request,
  env: Env,
  usuarioId: string,
  id: string | undefined,
  url: URL,
): Promise<Response> {
  // GET /categorias  ou  GET /categorias?since=ISO
  if (request.method === 'GET' && !id) {
    const since = url.searchParams.get('since');
    const stmt = since
      ? env.DB.prepare('SELECT * FROM categorias WHERE usuario_id = ? AND atualizado_em > ? ORDER BY atualizado_em ASC').bind(
          usuarioId,
          since,
        )
      : env.DB.prepare(
          'SELECT * FROM categorias WHERE usuario_id = ? AND excluido = 0 ORDER BY ordem ASC, criado_em ASC',
        ).bind(usuarioId);
    const { results } = await stmt.all<CategoriaRow>();
    return json(results.map(categoriaRowParaApi));
  }

  // GET /categorias/:id
  if (request.method === 'GET' && id) {
    const row = await buscarCategoriaPorId(env.DB, id, usuarioId);
    if (!row) return json({ erro: 'Categoria não encontrada' }, 404);
    return json(categoriaRowParaApi(row));
  }

  // POST /categorias  (upsert; usa o id do corpo)
  if (request.method === 'POST' && !id) {
    const categoria = (await request.json()) as CategoriaApi;
    if (!categoria.id || !categoria.atualizadoEm) {
      return json({ erro: 'id e atualizadoEm são obrigatórios' }, 400);
    }
    const resultado = await upsertCategoriaComLWW(env.DB, categoria, usuarioId);
    return json(resultado.categoria, resultado.aplicado ? 200 : 409);
  }

  // PUT /categorias/:id  (upsert; usa o id da URL)
  if (request.method === 'PUT' && id) {
    const corpo = (await request.json()) as CategoriaApi;
    const categoria: CategoriaApi = { ...corpo, id };
    if (!categoria.atualizadoEm) {
      return json({ erro: 'atualizadoEm é obrigatório' }, 400);
    }
    const resultado = await upsertCategoriaComLWW(env.DB, categoria, usuarioId);
    return json(resultado.categoria, resultado.aplicado ? 200 : 409);
  }

  // DELETE /categorias/:id  (soft delete; categorias de sistema nao podem ser excluidas)
  if (request.method === 'DELETE' && id) {
    const existente = await buscarCategoriaPorId(env.DB, id, usuarioId);
    if (existente?.sistema === 1) {
      return json({ erro: 'Categorias padrão não podem ser excluídas' }, 403);
    }
    const agora = new Date().toISOString();
    await env.DB.prepare('UPDATE categorias SET excluido = 1, atualizado_em = ? WHERE id = ? AND usuario_id = ?')
      .bind(agora, id, usuarioId)
      .run();
    return json({ ok: true });
  }

  return json({ erro: 'Método não suportado' }, 405);
}

interface ArquivoRow {
  id: string;
  usuario_id: string;
  ano: number;
  r2_key: string;
  quantidade_itens: number;
  tamanho_bytes: number;
  criado_em: string;
}

/** GET /arquivo (lista anos disponíveis) e GET /arquivo/:ano (baixa o histórico daquele ano do R2). */
async function tratarArquivo(
  request: Request,
  env: Env,
  usuarioId: string,
  anoParam: string | undefined,
): Promise<Response> {
  if (request.method !== 'GET') return json({ erro: 'Método não suportado' }, 405);

  if (!anoParam) {
    const { results } = await env.DB.prepare(
      'SELECT ano, quantidade_itens, tamanho_bytes, criado_em FROM arquivos WHERE usuario_id = ? ORDER BY ano DESC',
    )
      .bind(usuarioId)
      .all();
    return json(results);
  }

  const ano = Number(anoParam);
  const registro = await env.DB.prepare('SELECT * FROM arquivos WHERE usuario_id = ? AND ano = ?')
    .bind(usuarioId, ano)
    .first<ArquivoRow>();
  if (!registro) return json({ erro: 'Nada arquivado nesse ano' }, 404);

  const objeto = await env.ARQUIVO.get(registro.r2_key);
  if (!objeto) return json({ erro: 'Arquivo não encontrado no armazenamento' }, 404);

  return new Response(objeto.body, {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

/** Define/troca a senha do usuário logado — dá acesso por e-mail+senha (ex.: no site) pra quem entrou via Google. */
async function tratarUsuario(request: Request, env: Env, usuarioId: string, rota: string | undefined): Promise<Response> {
  if (rota === 'senha' && request.method === 'POST') {
    const { senha } = (await request.json()) as { senha?: string };
    if (!senha || senha.length < 6) {
      return json({ erro: 'A senha precisa ter pelo menos 6 caracteres' }, 400);
    }
    const senhaHash = await hashSenha(senha);
    await env.DB.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').bind(senhaHash, usuarioId).run();
    return json({ ok: true });
  }

  if (rota === 'cifra' && request.method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT versao, kdf_iteracoes, salt_senha, dek_cifrada_por_senha, salt_recuperacao, dek_cifrada_por_recuperacao FROM cifra_usuario WHERE usuario_id = ?',
    )
      .bind(usuarioId)
      .first<CifraRow>();
    if (!row) {
      return json({ erro: 'Criptografia não configurada' }, 404);
    }
    const resposta: CifraApi = {
      versao: row.versao,
      kdfIteracoes: row.kdf_iteracoes,
      saltSenha: row.salt_senha,
      dekCifradaPorSenha: row.dek_cifrada_por_senha,
      saltRecuperacao: row.salt_recuperacao,
      dekCifradaPorRecuperacao: row.dek_cifrada_por_recuperacao,
    };
    return json(resposta);
  }

  if (rota === 'cifra' && request.method === 'PUT') {
    const corpo = (await request.json()) as Partial<CifraApi>;
    const { kdfIteracoes, saltSenha, dekCifradaPorSenha, saltRecuperacao, dekCifradaPorRecuperacao } = corpo;
    if (!kdfIteracoes || !saltSenha || !dekCifradaPorSenha || !saltRecuperacao || !dekCifradaPorRecuperacao) {
      return json({ erro: 'Envelope de criptografia incompleto' }, 400);
    }
    const agora = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO cifra_usuario (usuario_id, versao, kdf_iteracoes, salt_senha, dek_cifrada_por_senha, salt_recuperacao, dek_cifrada_por_recuperacao, criado_em, atualizado_em)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(usuario_id) DO UPDATE SET
         kdf_iteracoes = excluded.kdf_iteracoes,
         salt_senha = excluded.salt_senha,
         dek_cifrada_por_senha = excluded.dek_cifrada_por_senha,
         salt_recuperacao = excluded.salt_recuperacao,
         dek_cifrada_por_recuperacao = excluded.dek_cifrada_por_recuperacao,
         atualizado_em = excluded.atualizado_em`,
    )
      .bind(usuarioId, kdfIteracoes, saltSenha, dekCifradaPorSenha, saltRecuperacao, dekCifradaPorRecuperacao, agora, agora)
      .run();
    return json({ ok: true });
  }

  return json({ erro: 'Rota não encontrada' }, 404);
}

export default {
  // Cron Trigger mensal (ver [triggers] em wrangler.toml) — move itens
  // concluídos com mais de 6 meses do D1 pro R2. Independente do fetch()
  // abaixo; não expõe nada por HTTP.
  async scheduled(_evento: ScheduledEvent, env: Env): Promise<void> {
    await arquivarItensAntigos(env.DB, env.ARQUIVO);
  },

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

      if (partes[0] === 'categorias') {
        return await tratarCategorias(request, env, usuarioId, partes[1], url);
      }

      if (partes[0] === 'usuario') {
        return await tratarUsuario(request, env, usuarioId, partes[1]);
      }

      if (partes[0] === 'arquivo') {
        return await tratarArquivo(request, env, usuarioId, partes[1]);
      }

      if (partes[0] !== 'items') {
        return json({ erro: 'Rota não encontrada' }, 404);
      }

      const id = partes[1];

      // GET /items  ou  GET /items?since=ISO
      if (request.method === 'GET' && !id) {
        // Fonte única de verdade da recorrência: antes de responder, garante
        // que toda série ativa já tem a ocorrência de hoje (e quaisquer
        // atrasadas) geradas no D1. Os aparelhos nunca mais geram ocorrência
        // por conta própria — só consomem o que está aqui.
        await gerarOcorrenciasPendentesNoServidor(env.DB, usuarioId);
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
        // Se o item excluído era raiz de uma série, desativa a série — não
        // faz sentido continuar gerando ocorrências de uma série sem raiz.
        await env.DB.prepare('UPDATE series_recorrentes SET ativa = 0, atualizado_em = ? WHERE id = ? AND usuario_id = ?')
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
