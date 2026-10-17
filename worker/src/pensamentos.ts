import type { Env } from './index';

// "Avia que alivia!" — registro de pensamentos (ver migrations/0018).
// Tudo aqui vive em tabelas e rotas NOVAS (/pensamentos e
// /pensamentos-compartilhados): nenhuma rota existente muda, e versões
// antigas do app simplesmente nunca chamam estas.
//
// Privacidade (dados de saúde mental): nada do conteúdo dos registros vai
// pra log nem pra mensagem de erro. Por isso este módulo tem o próprio
// try/catch com resposta genérica, em vez de cair no catch do fetch() em
// index.ts (que devolve `detalhe: String(erro)`).

export interface DependenciasPensamentos {
  json: (data: unknown, status?: number) => Response;
  enviarPush: (
    db: D1Database,
    destinatarioId: string,
    titulo: string,
    corpo: string,
    compartilhamentoId: string,
    tipo?: string,
  ) => Promise<void>;
}

const LIMITE_CARACTERES = 500;
// Texto cifrado (AVIA1:<iv>:<cifra> em base64) é bem maior que o texto puro
// e o servidor não consegue contar os caracteres originais — limita o
// tamanho do envelope com folga: 500 caracteres em UTF-8 ocupam no máximo
// 2000 bytes, ~2700 em base64.
const LIMITE_TEXTO_CIFRADO = 4000;
const PREFIXO_CIFRA = 'AVIA1:';
const MAX_REGISTROS_POR_COMPARTILHAMENTO = 50;

interface PensamentoRow {
  id: string;
  usuario_id: string;
  texto: string;
  registrado_em: string;
  excluido: number;
  criado_em: string;
  atualizado_em: string;
}

interface PensamentoApi {
  id: string;
  texto: string;
  registradoEm: string;
  atualizadoEm: string;
  excluido?: boolean;
}

interface PensamentoCompartilhadoRow {
  id: string;
  pensamento_id: string;
  criador_id: string;
  criador_nome: string;
  destinatario_id: string;
  status: string;
  texto: string;
  registrado_em: string;
  excluido: number;
  criado_em: string;
  atualizado_em: string;
}

function pensamentoParaApi(row: PensamentoRow): PensamentoApi {
  return {
    id: row.id,
    texto: row.texto,
    registradoEm: row.registrado_em,
    atualizadoEm: row.atualizado_em,
    excluido: row.excluido === 1,
  };
}

function textoValido(texto: unknown, permitirCifrado: boolean): texto is string {
  if (typeof texto !== 'string' || texto.trim().length === 0) return false;
  if (texto.startsWith(PREFIXO_CIFRA)) {
    return permitirCifrado && texto.length <= LIMITE_TEXTO_CIFRADO;
  }
  // Array.from conta caracteres de verdade (um emoji = 1), não unidades UTF-16.
  return Array.from(texto).length <= LIMITE_CARACTERES;
}

function dataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length <= 40 && !Number.isNaN(Date.parse(valor));
}

export async function tratarPensamentos(
  request: Request,
  env: Env,
  usuarioId: string,
  partes: string[],
  url: URL,
  deps: DependenciasPensamentos,
): Promise<Response> {
  try {
    if (partes[0] === 'pensamentos') {
      return await rotasPensamentos(request, env, usuarioId, partes[1], url, deps);
    }
    return await rotasCompartilhados(request, env, usuarioId, partes[1], partes[2], deps);
  } catch {
    // Sem detalhe do erro de propósito (ver comentário no topo).
    return deps.json({ erro: 'Erro interno' }, 500);
  }
}

async function rotasPensamentos(
  request: Request,
  env: Env,
  usuarioId: string,
  id: string | undefined,
  url: URL,
  { json }: DependenciasPensamentos,
): Promise<Response> {
  // GET /pensamentos  ou  GET /pensamentos?since=ISO
  if (request.method === 'GET' && !id) {
    // Cursor vem do relógio do SERVIDOR, capturado antes da consulta (mesmo
    // raciocínio de GET /items).
    const servidorEm = new Date().toISOString();
    const since = url.searchParams.get('since');
    const stmt = since
      ? env.DB.prepare(
          'SELECT * FROM pensamentos WHERE usuario_id = ? AND atualizado_em > ? ORDER BY atualizado_em ASC',
        ).bind(usuarioId, since)
      : env.DB.prepare(
          'SELECT * FROM pensamentos WHERE usuario_id = ? AND excluido = 0 ORDER BY registrado_em DESC',
        ).bind(usuarioId);
    const { results } = await stmt.all<PensamentoRow>();
    return json({ pensamentos: results.map(pensamentoParaApi), servidorEm });
  }

  // POST /pensamentos — upsert (criar, editar ou apagar via excluido: true), last write wins.
  if (request.method === 'POST' && !id) {
    const corpo = (await request.json()) as Partial<PensamentoApi>;
    if (typeof corpo.id !== 'string' || !corpo.id || corpo.id.length > 64) {
      return json({ erro: 'id inválido' }, 400);
    }
    if (!dataValida(corpo.registradoEm) || !dataValida(corpo.atualizadoEm)) {
      return json({ erro: 'Datas inválidas' }, 400);
    }
    if (!textoValido(corpo.texto, true)) {
      return json({ erro: `O registro precisa ter entre 1 e ${LIMITE_CARACTERES} caracteres` }, 400);
    }

    const existente = await env.DB.prepare('SELECT * FROM pensamentos WHERE id = ?')
      .bind(corpo.id)
      .first<PensamentoRow>();
    if (existente && existente.usuario_id !== usuarioId) {
      return json({ erro: 'Não autorizado' }, 403);
    }
    // ">" (não ">="): reenviar com o MESMO atualizadoEm é permitido — é assim
    // que o aparelho troca um texto puro antigo pela versão cifrada depois
    // que a pessoa ativa a criptografia, sem "inventar" uma edição nova.
    if (existente && existente.atualizado_em > corpo.atualizadoEm) {
      return json(pensamentoParaApi(existente), 409);
    }

    const excluido = corpo.excluido ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO pensamentos (id, usuario_id, texto, registrado_em, excluido, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         texto = excluded.texto,
         registrado_em = excluded.registrado_em,
         excluido = excluded.excluido,
         atualizado_em = excluded.atualizado_em`,
    )
      .bind(corpo.id, usuarioId, corpo.texto, corpo.registradoEm, excluido, new Date().toISOString(), corpo.atualizadoEm)
      .run();

    // Apagar um registro desfaz também todos os compartilhamentos dele —
    // quem recebeu deixa de ver.
    if (excluido) {
      await env.DB.prepare(
        'UPDATE pensamentos_compartilhados SET excluido = 1, atualizado_em = ? WHERE pensamento_id = ? AND criador_id = ? AND excluido = 0',
      )
        .bind(new Date().toISOString(), corpo.id, usuarioId)
        .run();
    }
    return json({ ok: true });
  }

  return json({ erro: 'Rota não encontrada' }, 404);
}

async function rotasCompartilhados(
  request: Request,
  env: Env,
  usuarioId: string,
  id: string | undefined,
  subrota: string | undefined,
  { json, enviarPush }: DependenciasPensamentos,
): Promise<Response> {
  // GET /pensamentos-compartilhados — lista completa (sem cursor: são poucos
  // registros, e o app não guarda cache local deles).
  if (request.method === 'GET' && !id) {
    const [{ results: enviados }, { results: recebidos }] = await Promise.all([
      env.DB.prepare(
        `SELECT c.*, u.nome AS destinatario_nome, u.email AS destinatario_email FROM pensamentos_compartilhados c
         JOIN usuarios u ON u.id = c.destinatario_id
         WHERE c.criador_id = ? AND c.excluido = 0 ORDER BY c.registrado_em DESC`,
      )
        .bind(usuarioId)
        .all<PensamentoCompartilhadoRow & { destinatario_nome: string; destinatario_email: string }>(),
      env.DB.prepare(
        `SELECT * FROM pensamentos_compartilhados
         WHERE destinatario_id = ? AND excluido = 0 AND status != 'recusado' ORDER BY registrado_em DESC`,
      )
        .bind(usuarioId)
        .all<PensamentoCompartilhadoRow>(),
    ]);

    return json({
      enviados: enviados.map((c) => ({
        id: c.id,
        pensamentoId: c.pensamento_id,
        destinatarioNome: c.destinatario_nome,
        destinatarioEmail: c.destinatario_email,
        status: c.status,
        registradoEm: c.registrado_em,
      })),
      // Quem recebe só vê o texto DEPOIS de aceitar — o convite pendente
      // mostra apenas de quem veio e quando.
      recebidos: recebidos.map((c) => ({
        id: c.id,
        criadorNome: c.criador_nome,
        status: c.status,
        texto: c.status === 'aceito' ? c.texto : null,
        registradoEm: c.registrado_em,
      })),
    });
  }

  // POST /pensamentos-compartilhados — compartilha um ou vários registros com um usuário do Avia.
  if (request.method === 'POST' && !id) {
    const corpo = (await request.json()) as {
      emailDestinatario?: unknown;
      registros?: { pensamentoId?: unknown; texto?: unknown; registradoEm?: unknown }[];
    };
    const email = typeof corpo.emailDestinatario === 'string' ? corpo.emailDestinatario.trim() : '';
    const registros = Array.isArray(corpo.registros) ? corpo.registros : [];
    if (!email || registros.length === 0 || registros.length > MAX_REGISTROS_POR_COMPARTILHAMENTO) {
      return json({ erro: 'Dados incompletos pra compartilhar' }, 400);
    }
    for (const r of registros) {
      // O snapshot precisa ser texto puro (quem recebe tem outra chave).
      if (typeof r.pensamentoId !== 'string' || !textoValido(r.texto, false) || !dataValida(r.registradoEm)) {
        return json({ erro: `Cada registro precisa ter entre 1 e ${LIMITE_CARACTERES} caracteres` }, 400);
      }
    }

    const destinatario = await env.DB.prepare('SELECT id FROM usuarios WHERE email = ?')
      .bind(email)
      .first<{ id: string }>();
    if (!destinatario) return json({ erro: 'Essa pessoa ainda não tem conta no Avia' }, 404);
    if (destinatario.id === usuarioId) {
      return json({ erro: 'Não é possível compartilhar consigo mesmo' }, 400);
    }

    // Só registros que são DESTE usuário e não foram apagados.
    for (const r of registros) {
      const dono = await env.DB.prepare('SELECT id FROM pensamentos WHERE id = ? AND usuario_id = ? AND excluido = 0')
        .bind(r.pensamentoId as string, usuarioId)
        .first();
      if (!dono) return json({ erro: 'Registro não encontrado' }, 403);
    }

    const criador = await env.DB.prepare('SELECT nome FROM usuarios WHERE id = ?')
      .bind(usuarioId)
      .first<{ nome: string }>();
    const criadorNome = criador?.nome ?? '';
    const agora = new Date().toISOString();

    let primeiroId = '';
    for (const r of registros) {
      const novoId = crypto.randomUUID();
      const linha = await env.DB.prepare(
        `INSERT INTO pensamentos_compartilhados (
          id, pensamento_id, criador_id, criador_nome, destinatario_id, status,
          texto, registrado_em, excluido, criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, 0, ?, ?)
        ON CONFLICT(pensamento_id, destinatario_id) DO UPDATE SET
          status = 'pendente',
          criador_nome = excluded.criador_nome,
          texto = excluded.texto,
          registrado_em = excluded.registrado_em,
          excluido = 0,
          atualizado_em = excluded.atualizado_em
        RETURNING id`,
      )
        .bind(novoId, r.pensamentoId as string, usuarioId, criadorNome, destinatario.id, r.texto as string, r.registradoEm as string, agora, agora)
        .first<{ id: string }>();
      if (!primeiroId) primeiroId = linha?.id ?? novoId;
    }

    // Notificação SEM o conteúdo — só quem compartilhou. Tipo próprio
    // ('pensamento_compartilhado'): versões antigas do app ignoram o toque
    // (só tratam 'compartilhamento'), as novas abrem a área "Avia que alivia!".
    const quantidade = registros.length;
    await enviarPush(
      env.DB,
      destinatario.id,
      'Avia que alivia!',
      `${criadorNome || 'Alguém'} compartilhou ${quantidade === 1 ? 'um registro' : `${quantidade} registros`} com você`,
      primeiroId,
      'pensamento_compartilhado',
    );
    return json({ ok: true });
  }

  if (!id) return json({ erro: 'Rota não encontrada' }, 404);

  const registro = await env.DB.prepare('SELECT * FROM pensamentos_compartilhados WHERE id = ?')
    .bind(id)
    .first<PensamentoCompartilhadoRow>();
  if (!registro || registro.excluido) return json({ erro: 'Compartilhamento não encontrado' }, 404);

  // POST /pensamentos-compartilhados/:id/responder — só o destinatário aceita/recusa.
  if (request.method === 'POST' && subrota === 'responder') {
    if (registro.destinatario_id !== usuarioId) return json({ erro: 'Não autorizado' }, 403);
    const { aceitar } = (await request.json()) as { aceitar?: boolean };
    await env.DB.prepare('UPDATE pensamentos_compartilhados SET status = ?, atualizado_em = ? WHERE id = ?')
      .bind(aceitar ? 'aceito' : 'recusado', new Date().toISOString(), id)
      .run();
    return json({ ok: true });
  }

  // DELETE /pensamentos-compartilhados/:id — quem compartilhou desfaz, ou quem recebeu remove da própria lista.
  if (request.method === 'DELETE' && !subrota) {
    if (registro.criador_id !== usuarioId && registro.destinatario_id !== usuarioId) {
      return json({ erro: 'Não autorizado' }, 403);
    }
    await env.DB.prepare('UPDATE pensamentos_compartilhados SET excluido = 1, atualizado_em = ? WHERE id = ?')
      .bind(new Date().toISOString(), id)
      .run();
    return json({ ok: true });
  }

  return json({ erro: 'Rota não encontrada' }, 404);
}

/**
 * Parte da exclusão de conta: apaga de verdade os registros e os
 * compartilhamentos (dos dois lados). Roda separado do batch principal de
 * excluirContaCompleta pra que, se o Worker novo for publicado antes da
 * migração 0018 (tabelas ainda inexistentes), a exclusão de conta continue
 * funcionando exatamente como antes — sem tabela, não há nada a apagar.
 */
export async function apagarPensamentosDaConta(db: D1Database, usuarioId: string): Promise<void> {
  try {
    await db.batch([
      db.prepare('DELETE FROM pensamentos WHERE usuario_id = ?').bind(usuarioId),
      db.prepare('DELETE FROM pensamentos_compartilhados WHERE criador_id = ? OR destinatario_id = ?').bind(usuarioId, usuarioId),
    ]);
  } catch (erro) {
    if (!String(erro).includes('no such table')) throw erro;
  }
}
