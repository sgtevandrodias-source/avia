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
  foto_url: string | null;
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
  return { id: row.id, email: row.email, nome: row.nome, fotoUrl: row.foto_url };
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
  if (item.origemRecorrenciaId) {
    // Não é a raiz — é uma ocorrência gerada (a que o usuário normalmente vê
    // e edita no dia a dia). Mas se ele desligou a recorrência aqui, a
    // intenção de "parar de repetir" é clara mesmo assim: desativa a série
    // que essa ocorrência aponta, senão ela nunca é desligada de fato (a
    // raiz raramente é editada diretamente pelo app).
    if (item.recorrencia === 'nenhuma') {
      await db
        .prepare('UPDATE series_recorrentes SET ativa = 0, atualizado_em = ? WHERE id = ? AND usuario_id = ?')
        .bind(new Date().toISOString(), item.origemRecorrenciaId, usuarioId)
        .run();
    }
    return;
  }

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
  await sincronizarConclusaoCompartilhamentos(db, item.id, usuarioId, item.status === 'feito');

  return { item, aplicado: true };
}

/**
 * Espelha o status do item original em qualquer compartilhamento ativo dele
 * — só nessa direção (criador → destinatário, nunca o contrário). Quem
 * criou o item marca como feito quando RESOLVE o assunto (ex.: "vou na
 * reunião" ou "mando alguém"); o destinatário só recebeu como aviso, então
 * ver a tarefa "pendente" no aparelho dele depois que o criador já resolveu
 * não faz sentido. Se o próprio destinatário já tinha marcado como feito
 * antes por conta própria (concluido_pelo_destinatario, ver rota
 * PUT /compartilhamentos/:id/concluir), esse valor independente só é
 * sobrescrito quando o CRIADOR mexe no item — nunca o inverso.
 */
async function sincronizarConclusaoCompartilhamentos(
  db: D1Database,
  itemId: string,
  criadorId: string,
  concluido: boolean,
): Promise<void> {
  await db
    .prepare(
      `UPDATE compartilhamentos SET concluido_pelo_destinatario = ?, atualizado_em = ?
       WHERE item_id = ? AND criador_id = ? AND excluido = 0`,
    )
    .bind(concluido ? 1 : 0, new Date().toISOString(), itemId, criadorId)
    .run();

  // Avisa por push só quando o criador MARCA como feito — sem isso, quem
  // recebeu só saberia na próxima vez que o aparelho dele sincronizasse
  // sozinho (poll de 20s, abrir o app), o que pode demorar se o app dele
  // estiver fechado (ver enviarPushConclusaoCompartilhamento).
  if (!concluido) return;

  const linha = await db
    .prepare(
      `SELECT c.id, c.destinatario_id, c.titulo, u.nome as criador_nome
       FROM compartilhamentos c JOIN usuarios u ON u.id = c.criador_id
       WHERE c.item_id = ? AND c.criador_id = ? AND c.excluido = 0`,
    )
    .bind(itemId, criadorId)
    .first<{ id: string; destinatario_id: string; titulo: string; criador_nome: string }>();
  if (!linha) return;

  await enviarPushConclusaoCompartilhamento(db, linha.destinatario_id, linha.criador_nome, linha.titulo, linha.id);
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
    return json({ token, usuario: { id, email, nome, fotoUrl: null } });
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
        await env.DB.prepare('UPDATE usuarios SET google_sub = ?, foto_url = ? WHERE id = ?')
          .bind(payload.sub, payload.picture ?? null, usuario.id)
          .run();
        usuario.foto_url = payload.picture ?? null;
      } else {
        const id = crypto.randomUUID();
        await env.DB.prepare(
          'INSERT INTO usuarios (id, email, nome, senha_hash, google_sub, foto_url, criado_em) VALUES (?, ?, ?, NULL, ?, ?, ?)',
        )
          .bind(id, payload.email, payload.name, payload.sub, payload.picture ?? null, new Date().toISOString())
          .run();
        await semearCategoriasPadrao(env.DB, id);
        usuario = {
          id,
          email: payload.email,
          nome: payload.name,
          senha_hash: null,
          google_sub: payload.sub,
          foto_url: payload.picture ?? null,
          criado_em: '',
        };
      }
    } else if (usuario.foto_url !== (payload.picture ?? null)) {
      // Login de Google de quem já tem conta — a foto pode ter mudado desde
      // o último login; mantém sincronizada com o que o Google reporta agora.
      await env.DB.prepare('UPDATE usuarios SET foto_url = ? WHERE id = ?')
        .bind(payload.picture ?? null, usuario.id)
        .run();
      usuario.foto_url = payload.picture ?? null;
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
    // O timestamp do próximo cursor de sincronização PRECISA vir do relógio
    // do servidor, capturado ANTES da consulta — nunca do relógio do
    // aparelho que está chamando. Se o cliente usasse o próprio relógio pra
    // marcar "sincronizei até aqui", qualquer diferença de horário entre o
    // aparelho e o Worker (mesmo poucos segundos) faz alterações feitas
    // pelo servidor (ex.: exclusão, geração de recorrência) ficarem com um
    // atualizado_em "anterior" ao cursor do cliente e nunca mais aparecerem
    // pra ele — foi exatamente essa a causa da sincronização silenciosamente
    // não propagar exclusões entre aparelhos.
    const servidorEm = new Date().toISOString();
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
    return json({ categorias: results.map(categoriaRowParaApi), servidorEm });
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

// Compartilhamento de um item com outro usuário (ver migrations/0014).
// Snapshot dos campos decifrados no aparelho de quem compartilha — o
// servidor nunca lê titulo/notas de um item cifrado, então não dá pra
// guardar só uma referência ao item original (ver comentário na migration).
interface CompartilhamentoRow {
  id: string;
  item_id: string;
  criador_id: string;
  criador_nome: string;
  destinatario_id: string;
  status: string;
  titulo: string;
  texto_original: string;
  data: string;
  hora_compromisso: string | null;
  hora_limite: string | null;
  tipo_horario: string;
  categoria_nome: string;
  categoria_icone: string;
  categoria_cor: string;
  notas: string | null;
  concluido_pelo_destinatario: number;
  excluido: number;
  criado_em: string;
  atualizado_em: string;
}

interface CompartilhamentoApi {
  id: string;
  itemId: string;
  criadorId: string;
  criadorNome: string;
  destinatarioId: string;
  destinatarioNome?: string; // só presente numa consulta com join (ver enviados em GET /compartilhamentos) — não é coluna própria.
  status: string;
  titulo: string;
  textoOriginal: string;
  data: string;
  horaCompromisso: string | null;
  horaLimite: string | null;
  tipoHorario: string;
  categoriaNome: string;
  categoriaIcone: string;
  categoriaCor: string;
  notas: string | null;
  concluidoPeloDestinatario: boolean;
  criadoEm: string;
  atualizadoEm: string;
  excluido?: boolean;
}

function compartilhamentoRowParaApi(
  row: CompartilhamentoRow & { destinatario_nome?: string },
): CompartilhamentoApi {
  return {
    id: row.id,
    itemId: row.item_id,
    criadorId: row.criador_id,
    criadorNome: row.criador_nome,
    destinatarioId: row.destinatario_id,
    destinatarioNome: row.destinatario_nome,
    status: row.status,
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
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
    excluido: row.excluido === 1,
  };
}

/** GET /usuarios/buscar?email=... — busca exata por e-mail, nunca lista/filtra por outro critério (não expor a base de contas). */
async function tratarUsuariosBusca(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET') return json({ erro: 'Método não suportado' }, 405);
  const email = url.searchParams.get('email');
  if (!email) return json({ erro: 'email é obrigatório' }, 400);
  const usuario = await env.DB.prepare('SELECT id, nome FROM usuarios WHERE email = ?')
    .bind(email)
    .first<{ id: string; nome: string }>();
  if (!usuario) return json({ erro: 'Essa pessoa ainda não tem conta no Avia' }, 404);
  return json(usuario);
}

async function buscarCompartilhamentoPorId(db: D1Database, id: string): Promise<CompartilhamentoRow | null> {
  const row = await db.prepare('SELECT * FROM compartilhamentos WHERE id = ?').bind(id).first<CompartilhamentoRow>();
  return row ?? null;
}

/**
 * Notifica (best-effort) todos os aparelhos do destinatário sobre um convite
 * de compartilhamento novo ou atualizado, via Expo Push API. Nunca lança —
 * uma falha de push (token inválido, Expo fora do ar, etc.) não pode
 * derrubar a resposta do compartilhamento em si. Sem credencial nenhuma
 * aqui: quem precisa da credencial FCM é o serviço do Expo, configurado via
 * EAS no lado do cliente, não este Worker.
 */
async function enviarPush(
  db: D1Database,
  destinatarioId: string,
  titulo: string,
  corpo: string,
  compartilhamentoId: string,
): Promise<void> {
  try {
    const { results } = await db
      .prepare('SELECT token FROM push_tokens WHERE usuario_id = ?')
      .bind(destinatarioId)
      .all<{ token: string }>();
    if (results.length === 0) return;

    const mensagens = results.map((r) => ({
      to: r.token,
      title: titulo,
      body: corpo,
      // "compartilhamento" (não um tipo novo): o cliente já sabe tratar esse
      // toque — sincroniza e navega pra tela Compartilhados (ver
      // CompartilhamentosContext.tsx) — serve igual bem pra "convite novo"
      // e pra "item concluído pelo criador".
      data: { tipo: 'compartilhamento', compartilhamentoId },
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(mensagens),
    });
  } catch {
    // best-effort — quem disparou a ação já recebeu uma resposta ok de qualquer forma.
  }
}

async function enviarPushCompartilhamento(
  db: D1Database,
  destinatarioId: string,
  criadorNome: string,
  tituloItem: string,
  compartilhamentoId: string,
): Promise<void> {
  await enviarPush(
    db,
    destinatarioId,
    'Novo compromisso compartilhado',
    `${criadorNome} compartilhou "${tituloItem}" com você`,
    compartilhamentoId,
  );
}

/**
 * Avisa o destinatário quando o CRIADOR marca o item original como feito —
 * fecha o mesmo tipo de lacuna que o push de convite já fecha pro
 * compartilhamento em si: sem isso, a propagação de conclusão (ver
 * sincronizarConclusaoCompartilhamentos) só chega no aparelho do
 * destinatário na próxima vez que ele sincronizar (poll de 20s, abrir o
 * app, ou sincronizar manualmente) — o que pode levar bom tempo se o app
 * dele estiver fechado. Só dispara quando `concluido` é true: desmarcar
 * (voltar pra pendente) não é um evento urgente o bastante pra justificar
 * uma notificação.
 */
async function enviarPushConclusaoCompartilhamento(
  db: D1Database,
  destinatarioId: string,
  criadorNome: string,
  tituloItem: string,
  compartilhamentoId: string,
): Promise<void> {
  await enviarPush(
    db,
    destinatarioId,
    'Compromisso concluído',
    `${criadorNome} marcou "${tituloItem}" como feito`,
    compartilhamentoId,
  );
}

async function tratarCompartilhamentos(
  request: Request,
  env: Env,
  usuarioId: string,
  id: string | undefined,
  subrota: string | undefined,
  url: URL,
): Promise<Response> {
  // GET /compartilhamentos  ou  GET /compartilhamentos?since=ISO
  if (request.method === 'GET' && !id) {
    // Mesmo raciocínio do cursor de items/categorias: o timestamp vem do
    // relógio do SERVIDOR, capturado antes da consulta.
    const servidorEm = new Date().toISOString();
    const since = url.searchParams.get('since');

    // "enviados" sempre traz o nome do destinatário via join (pra UI mostrar
    // "compartilhado com {nome}") — em ambos os ramos, incremental ou não,
    // senão um pull incremental devolveria destinatarioNome undefined.
    const enviadosStmt = since
      ? env.DB.prepare(
          `SELECT c.*, u.nome as destinatario_nome FROM compartilhamentos c
           JOIN usuarios u ON u.id = c.destinatario_id
           WHERE c.criador_id = ? AND c.atualizado_em > ? ORDER BY c.atualizado_em ASC`,
        ).bind(usuarioId, since)
      : env.DB.prepare(
          `SELECT c.*, u.nome as destinatario_nome FROM compartilhamentos c
           JOIN usuarios u ON u.id = c.destinatario_id
           WHERE c.criador_id = ? AND c.excluido = 0 ORDER BY c.atualizado_em DESC`,
        ).bind(usuarioId);
    const recebidosStmt = since
      ? env.DB.prepare(
          'SELECT * FROM compartilhamentos WHERE destinatario_id = ? AND atualizado_em > ? ORDER BY atualizado_em ASC',
        ).bind(usuarioId, since)
      : env.DB.prepare(
          'SELECT * FROM compartilhamentos WHERE destinatario_id = ? AND excluido = 0 ORDER BY atualizado_em DESC',
        ).bind(usuarioId);

    const [{ results: enviados }, { results: recebidos }] = await Promise.all([
      enviadosStmt.all<CompartilhamentoRow & { destinatario_nome?: string }>(),
      recebidosStmt.all<CompartilhamentoRow>(),
    ]);

    return json({
      enviados: enviados.map(compartilhamentoRowParaApi),
      recebidos: recebidos.map(compartilhamentoRowParaApi),
      servidorEm,
    });
  }

  // POST /compartilhamentos — cria ou atualiza (upsert por item_id+destinatario) um convite de compartilhamento.
  if (request.method === 'POST' && !id) {
    const corpo = (await request.json()) as {
      itemId?: string;
      emailDestinatario?: string;
      titulo?: string;
      textoOriginal?: string;
      data?: string;
      horaCompromisso?: string | null;
      horaLimite?: string | null;
      tipoHorario?: string;
      categoriaNome?: string;
      categoriaIcone?: string;
      categoriaCor?: string;
      notas?: string | null;
    };
    const {
      itemId,
      emailDestinatario,
      titulo,
      textoOriginal,
      data,
      tipoHorario,
      categoriaNome,
      categoriaIcone,
      categoriaCor,
    } = corpo;
    if (!itemId || !emailDestinatario || !titulo || !textoOriginal || !data || !tipoHorario || !categoriaNome || !categoriaIcone || !categoriaCor) {
      return json({ erro: 'Dados incompletos pra compartilhar' }, 400);
    }

    const item = await buscarPorId(env.DB, itemId, usuarioId);
    if (!item) return json({ erro: 'Item não encontrado' }, 403);

    const destinatario = await env.DB.prepare('SELECT id, nome FROM usuarios WHERE email = ?')
      .bind(emailDestinatario)
      .first<{ id: string; nome: string }>();
    if (!destinatario) return json({ erro: 'Essa pessoa ainda não tem conta no Avia' }, 404);
    if (destinatario.id === usuarioId) {
      return json({ erro: 'Não é possível compartilhar consigo mesmo' }, 400);
    }

    const criador = await env.DB.prepare('SELECT nome FROM usuarios WHERE id = ?')
      .bind(usuarioId)
      .first<{ nome: string }>();

    const agora = new Date().toISOString();
    const novoId = crypto.randomUUID();
    const resultado = await env.DB.prepare(
      `INSERT INTO compartilhamentos (
        id, item_id, criador_id, criador_nome, destinatario_id, status,
        titulo, texto_original, data, hora_compromisso, hora_limite, tipo_horario,
        categoria_nome, categoria_icone, categoria_cor, notas,
        concluido_pelo_destinatario, excluido, criado_em, atualizado_em
      ) VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      ON CONFLICT(item_id, destinatario_id) DO UPDATE SET
        status = 'pendente',
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
        excluido = 0,
        atualizado_em = excluded.atualizado_em
      RETURNING id`,
    )
      .bind(
        novoId,
        itemId,
        usuarioId,
        criador?.nome ?? '',
        destinatario.id,
        titulo,
        textoOriginal,
        data,
        corpo.horaCompromisso ?? null,
        corpo.horaLimite ?? null,
        tipoHorario,
        categoriaNome,
        categoriaIcone,
        categoriaCor,
        corpo.notas ?? null,
        agora,
        agora,
      )
      .first<{ id: string }>();

    // RETURNING id devolve o id de verdade da linha — numa atualização
    // (ON CONFLICT), é o id ORIGINAL do compartilhamento, não o novoId
    // gerado agora, então isso não pode vir de `novoId` direto.
    await enviarPushCompartilhamento(env.DB, destinatario.id, criador?.nome ?? 'Alguém', titulo, resultado?.id ?? novoId);

    return json({ ok: true });
  }

  if (!id) return json({ erro: 'Rota não encontrada' }, 404);

  // POST /compartilhamentos/:id/responder — só o destinatário aceita/recusa.
  if (request.method === 'POST' && subrota === 'responder') {
    const registro = await buscarCompartilhamentoPorId(env.DB, id);
    if (!registro || registro.excluido) return json({ erro: 'Compartilhamento não encontrado' }, 404);
    if (registro.destinatario_id !== usuarioId) return json({ erro: 'Não autorizado' }, 403);

    const { aceitar } = (await request.json()) as { aceitar?: boolean };
    await env.DB.prepare('UPDATE compartilhamentos SET status = ?, atualizado_em = ? WHERE id = ?')
      .bind(aceitar ? 'aceito' : 'recusado', new Date().toISOString(), id)
      .run();
    return json({ ok: true });
  }

  // PUT /compartilhamentos/:id/concluir — só o destinatário marca como feito/pendente.
  if (request.method === 'PUT' && subrota === 'concluir') {
    const registro = await buscarCompartilhamentoPorId(env.DB, id);
    if (!registro || registro.excluido) return json({ erro: 'Compartilhamento não encontrado' }, 404);
    if (registro.destinatario_id !== usuarioId) return json({ erro: 'Não autorizado' }, 403);

    const { concluido } = (await request.json()) as { concluido?: boolean };
    await env.DB.prepare('UPDATE compartilhamentos SET concluido_pelo_destinatario = ?, atualizado_em = ? WHERE id = ?')
      .bind(concluido ? 1 : 0, new Date().toISOString(), id)
      .run();
    return json({ ok: true });
  }

  // DELETE /compartilhamentos/:id — o criador revoga ou o destinatário remove da própria agenda.
  if (request.method === 'DELETE' && !subrota) {
    const registro = await buscarCompartilhamentoPorId(env.DB, id);
    if (!registro || registro.excluido) return json({ erro: 'Compartilhamento não encontrado' }, 404);
    if (registro.criador_id !== usuarioId && registro.destinatario_id !== usuarioId) {
      return json({ erro: 'Não autorizado' }, 403);
    }
    await env.DB.prepare('UPDATE compartilhamentos SET excluido = 1, atualizado_em = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();
    return json({ ok: true });
  }

  return json({ erro: 'Rota não encontrada' }, 404);
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

  // Registra/atualiza o Expo Push Token deste aparelho (ver src/notifications/pushToken.ts).
  // Chave é o token, não o usuario_id — um usuário pode ter vários aparelhos.
  if (rota === 'push-token' && request.method === 'POST') {
    const { token } = (await request.json()) as { token?: string };
    if (!token) return json({ erro: 'token é obrigatório' }, 400);
    await env.DB.prepare(
      `INSERT INTO push_tokens (token, usuario_id, criado_em) VALUES (?, ?, ?)
       ON CONFLICT(token) DO UPDATE SET usuario_id = excluded.usuario_id, criado_em = excluded.criado_em`,
    )
      .bind(token, usuarioId, new Date().toISOString())
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

      if (partes[0] === 'usuarios' && partes[1] === 'buscar') {
        return await tratarUsuariosBusca(request, env, url);
      }

      if (partes[0] === 'compartilhamentos') {
        return await tratarCompartilhamentos(request, env, usuarioId, partes[1], partes[2], url);
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
        // Ver comentário equivalente em tratarCategorias: o cursor da próxima
        // sincronização tem que ser o relógio do SERVIDOR, não o do aparelho
        // — senão exclusões e ocorrências geradas aqui podem ficar com um
        // atualizado_em "anterior" ao cursor que o cliente guardou e nunca
        // mais chegar até ele.
        const servidorEm = new Date().toISOString();
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
        return json({ itens: results.map(rowParaApi), servidorEm });
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
