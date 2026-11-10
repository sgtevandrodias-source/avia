import type { Env } from './index';

// Transferência de tarefas entre contas (ver migrations/0021).
//
// Diferente do compartilhamento (que manda uma CÓPIA): aqui o dono escolhe
// tarefas, a outra conta aceita, e as tarefas passam a PERTENCER a ela —
// items.usuario_id muda e elas saem da conta de origem. Tudo vive em rotas
// NOVAS (/transferencias); nenhuma rota existente muda de comportamento, e
// versões antigas do app simplesmente nunca chamam estas.
//
// Como a origem fica sabendo que a tarefa saiu: o aceite grava uma linha em
// itens_transferidos, e GET /items?since= (index.ts) devolve essa linha como
// um item com excluido = true — o mesmo caminho de uma exclusão comum, que
// todas as versões do app já tratam (apaga a tarefa e o lembrete). Se um
// aparelho da origem ainda tentar reenviar a tarefa, o upsert de /items
// recusa (a tarefa agora é de outra conta — ver upsertComLWW).
//
// Privacidade: as notificações dizem só QUEM e QUANTAS, nunca os títulos.

export interface DependenciasTransferencias {
  json: (data: unknown, status?: number) => Response;
  enviarPush: (
    db: D1Database,
    destinatarioId: string,
    titulo: string,
    corpo: string,
    compartilhamentoId: string,
    tipo?: string,
  ) => Promise<void>;
  dentroDoLimite: (limitador: Env['LIMITE_USUARIO'], chave: string) => Promise<boolean>;
  respostaLimiteExcedido: () => Response;
}

const MAX_ITENS = 200;
const MAX_TRANSFERENCIAS_POR_HORA = 20;
const DIAS_DE_VALIDADE = 7;
// Quanto tempo a origem continua vendo uma transferência já respondida
// (pra mostrar "Fulano aceitou suas 5 tarefas").
const DIAS_RESPONDIDAS_VISIVEIS = 7;
// O D1 aceita no máximo 100 parâmetros por consulta.
const TAMANHO_LOTE = 90;
const PREFIXO_CIFRA = 'AVIA1:';

const MSG_EMAIL_SEM_CONTA = 'Esse e-mail ainda não usa o Avia. Peça para a pessoa entrar no app uma vez.';
const MSG_INDISPONIVEL = 'Essa transferência não está mais disponível.';

interface TransferenciaRow {
  id: string;
  de_usuario_id: string;
  para_usuario_id: string;
  status: string;
  criado_em: string;
  respondido_em: string | null;
  expira_em: string;
}

function emLotes<T>(lista: T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += TAMANHO_LOTE) lotes.push(lista.slice(i, i + TAMANHO_LOTE));
  return lotes;
}

function marcadores(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ');
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function estaCifrado(valor: string | null): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO_CIFRA);
}

/** Pendentes com prazo vencido viram 'expirada' (verificação na leitura — não precisa de cron). */
async function expirarVencidas(db: D1Database, usuarioId: string, agora: string): Promise<void> {
  await db
    .prepare(
      `UPDATE transferencias SET status = 'expirada', respondido_em = ?
       WHERE status = 'pendente' AND expira_em <= ? AND (de_usuario_id = ? OR para_usuario_id = ?)`,
    )
    .bind(agora, agora, usuarioId, usuarioId)
    .run();
}

export async function tratarTransferencias(
  request: Request,
  env: Env,
  usuarioId: string,
  partes: string[],
  dep: DependenciasTransferencias,
): Promise<Response> {
  const { json } = dep;
  const agora = new Date().toISOString();
  await expirarVencidas(env.DB, usuarioId, agora);

  const [, idOuLista, acao] = partes;

  // POST /transferencias — cria o pedido.
  if (request.method === 'POST' && !idOuLista) {
    return criarTransferencia(request, env, usuarioId, agora, dep);
  }

  // GET /transferencias/recebidas — pendentes pra mim, com prévia das tarefas.
  if (request.method === 'GET' && idOuLista === 'recebidas' && !acao) {
    const { results: transferencias } = await env.DB.prepare(
      `SELECT t.*, u.nome AS de_nome, u.email AS de_email FROM transferencias t
       JOIN usuarios u ON u.id = t.de_usuario_id
       WHERE t.para_usuario_id = ? AND t.status = 'pendente'
       ORDER BY t.criado_em DESC`,
    )
      .bind(usuarioId)
      .all<TransferenciaRow & { de_nome: string; de_email: string }>();

    const { results: itens } = await env.DB.prepare(
      `SELECT ti.transferencia_id, i.id, i.titulo, i.data, i.hora_compromisso, i.tipo_horario
       FROM transferencia_itens ti
       JOIN transferencias t ON t.id = ti.transferencia_id
       JOIN items i ON i.id = ti.item_id AND i.usuario_id = t.de_usuario_id AND i.excluido = 0
       WHERE t.para_usuario_id = ? AND t.status = 'pendente'
       ORDER BY i.data ASC`,
    )
      .bind(usuarioId)
      .all<{
        transferencia_id: string;
        id: string;
        titulo: string;
        data: string;
        hora_compromisso: string | null;
        tipo_horario: string;
      }>();

    return json({
      recebidas: transferencias.map((t) => ({
        id: t.id,
        deNome: t.de_nome,
        deEmail: t.de_email,
        criadoEm: t.criado_em,
        expiraEm: t.expira_em,
        itens: itens
          .filter((i) => i.transferencia_id === t.id)
          .map((i) => ({
            id: i.id,
            titulo: i.titulo,
            data: i.data,
            horaCompromisso: i.hora_compromisso,
            tipoHorario: i.tipo_horario,
          })),
      })),
    });
  }

  // GET /transferencias/enviadas — pendentes que eu enviei (com os ids, pro
  // app bloquear essas tarefas) e as respondidas nos últimos dias.
  if (request.method === 'GET' && idOuLista === 'enviadas' && !acao) {
    const limiteRespondidas = new Date(Date.now() - DIAS_RESPONDIDAS_VISIVEIS * 86_400_000).toISOString();
    const { results: transferencias } = await env.DB.prepare(
      `SELECT t.*, u.nome AS para_nome, u.email AS para_email FROM transferencias t
       JOIN usuarios u ON u.id = t.para_usuario_id
       WHERE t.de_usuario_id = ? AND (t.status = 'pendente' OR t.respondido_em > ?)
       ORDER BY t.criado_em DESC`,
    )
      .bind(usuarioId, limiteRespondidas)
      .all<TransferenciaRow & { para_nome: string; para_email: string }>();

    const { results: itens } = await env.DB.prepare(
      `SELECT ti.transferencia_id, ti.item_id, ti.movido FROM transferencia_itens ti
       JOIN transferencias t ON t.id = ti.transferencia_id
       WHERE t.de_usuario_id = ? AND (t.status = 'pendente' OR t.respondido_em > ?)`,
    )
      .bind(usuarioId, limiteRespondidas)
      .all<{ transferencia_id: string; item_id: string; movido: number }>();

    return json({
      enviadas: transferencias.map((t) => {
        const daTransferencia = itens.filter((i) => i.transferencia_id === t.id);
        return {
          id: t.id,
          status: t.status,
          paraNome: t.para_nome,
          paraEmail: t.para_email,
          criadoEm: t.criado_em,
          respondidoEm: t.respondido_em,
          expiraEm: t.expira_em,
          itemIds: daTransferencia.map((i) => i.item_id),
          quantidadeMovida: daTransferencia.filter((i) => i.movido === 1).length,
        };
      }),
    });
  }

  // POST /transferencias/:id/(aceitar|recusar|cancelar)
  if (request.method === 'POST' && idOuLista && acao) {
    const transferencia = await env.DB.prepare('SELECT * FROM transferencias WHERE id = ?')
      .bind(idOuLista)
      .first<TransferenciaRow>();
    const souDestino = transferencia?.para_usuario_id === usuarioId;
    const souOrigem = transferencia?.de_usuario_id === usuarioId;
    if (!transferencia || (!souDestino && !souOrigem)) {
      return json({ erro: 'Transferência não encontrada' }, 404);
    }

    if (acao === 'aceitar' && souDestino) {
      return aceitarTransferencia(env, transferencia, agora, dep);
    }

    if ((acao === 'recusar' && souDestino) || (acao === 'cancelar' && souOrigem)) {
      const novoStatus = acao === 'recusar' ? 'recusada' : 'cancelada';
      const resultado = await env.DB.prepare(
        `UPDATE transferencias SET status = ?, respondido_em = ? WHERE id = ? AND status = 'pendente'`,
      )
        .bind(novoStatus, agora, transferencia.id)
        .run();
      if (!resultado.meta.changes) return json({ erro: MSG_INDISPONIVEL }, 409);

      if (acao === 'recusar') {
        const destino = await env.DB.prepare('SELECT nome FROM usuarios WHERE id = ?')
          .bind(usuarioId)
          .first<{ nome: string }>();
        await dep.enviarPush(
          env.DB,
          transferencia.de_usuario_id,
          'Transferência recusada',
          `${destino?.nome ?? 'A outra conta'} recusou as tarefas que você enviou. Elas continuam com você.`,
          transferencia.id,
          'transferencia',
        );
      }
      return json({ ok: true, status: novoStatus });
    }

    return json({ erro: 'Ação não permitida' }, 403);
  }

  return json({ erro: 'Rota não encontrada' }, 404);
}

async function criarTransferencia(
  request: Request,
  env: Env,
  usuarioId: string,
  agora: string,
  dep: DependenciasTransferencias,
): Promise<Response> {
  const { json } = dep;
  const corpo = (await request.json()) as {
    emailDestino?: unknown;
    email_destino?: unknown;
    itemIds?: unknown;
    item_ids?: unknown;
  };
  const emailBruto = corpo.emailDestino ?? corpo.email_destino;
  const idsBrutos = corpo.itemIds ?? corpo.item_ids;

  if (typeof emailBruto !== 'string' || !emailBruto.trim() || emailBruto.length > 254) {
    return json({ erro: 'Informe o e-mail de destino.' }, 400);
  }
  if (
    !Array.isArray(idsBrutos) ||
    idsBrutos.length === 0 ||
    !idsBrutos.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 1000)
  ) {
    return json({ erro: 'Escolha ao menos uma tarefa.' }, 400);
  }
  const itemIds = [...new Set(idsBrutos as string[])];
  if (itemIds.length > MAX_ITENS) {
    return json({ erro: `Dá para transferir no máximo ${MAX_ITENS} tarefas por vez.` }, 400);
  }

  if (!(await dep.dentroDoLimite(env.LIMITE_USUARIO, `transferir:${usuarioId}`))) {
    return dep.respostaLimiteExcedido();
  }
  const umaHoraAtras = new Date(Date.now() - 3_600_000).toISOString();
  const recentes = await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM transferencias WHERE de_usuario_id = ? AND criado_em > ?',
  )
    .bind(usuarioId, umaHoraAtras)
    .first<{ total: number }>();
  if ((recentes?.total ?? 0) >= MAX_TRANSFERENCIAS_POR_HORA) {
    return json({ erro: 'Você fez muitas transferências na última hora. Tente de novo mais tarde.' }, 429);
  }

  const email = emailBruto.trim().toLowerCase();
  const destino = await env.DB.prepare('SELECT id, nome, email FROM usuarios WHERE lower(email) = ?')
    .bind(email)
    .first<{ id: string; nome: string; email: string }>();
  if (!destino) return json({ erro: MSG_EMAIL_SEM_CONTA }, 404);
  if (destino.id === usuarioId) {
    return json({ erro: 'Esse é o e-mail da sua própria conta.' }, 400);
  }

  // Todas as tarefas são minhas e não estão apagadas.
  const encontrados: { id: string; titulo: string; texto_original: string; notas: string | null }[] = [];
  for (const lote of emLotes(itemIds)) {
    const { results } = await env.DB.prepare(
      `SELECT id, titulo, texto_original, notas FROM items
       WHERE usuario_id = ? AND excluido = 0 AND id IN (${marcadores(lote.length)})`,
    )
      .bind(usuarioId, ...lote)
      .all<{ id: string; titulo: string; texto_original: string; notas: string | null }>();
    encontrados.push(...results);
  }
  if (encontrados.length !== itemIds.length) {
    return json({ erro: 'Alguma tarefa não foi encontrada (pode ter sido apagada). Atualize a lista e tente de novo.' }, 400);
  }

  // O servidor não consegue decifrar: o app precisa mandar a versão aberta
  // antes (com o aviso ao usuário). Sem isso, o destino receberia texto ilegível.
  const cifrados = encontrados
    .filter((i) => estaCifrado(i.titulo) || estaCifrado(i.texto_original) || estaCifrado(i.notas))
    .map((i) => i.id);
  if (cifrados.length > 0) {
    return json(
      {
        erro: 'Algumas tarefas estão criptografadas. Elas precisam ser abertas antes de transferir.',
        codigo: 'cifradas',
        itemIds: cifrados,
      },
      409,
    );
  }

  // Nenhuma tarefa já está esperando outra transferência.
  const emOutra: string[] = [];
  for (const lote of emLotes(itemIds)) {
    const { results } = await env.DB.prepare(
      `SELECT ti.item_id FROM transferencia_itens ti
       JOIN transferencias t ON t.id = ti.transferencia_id
       WHERE t.status = 'pendente' AND ti.item_id IN (${marcadores(lote.length)})`,
    )
      .bind(...lote)
      .all<{ item_id: string }>();
    emOutra.push(...results.map((r) => r.item_id));
  }
  if (emOutra.length > 0) {
    return json(
      { erro: 'Alguma tarefa já está aguardando outra transferência.', codigo: 'ja_pendente', itemIds: emOutra },
      409,
    );
  }

  const id = crypto.randomUUID();
  const expiraEm = new Date(Date.now() + DIAS_DE_VALIDADE * 86_400_000).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO transferencias (id, de_usuario_id, para_usuario_id, status, criado_em, respondido_em, expira_em)
       VALUES (?, ?, ?, 'pendente', ?, NULL, ?)`,
    ).bind(id, usuarioId, destino.id, agora, expiraEm),
    ...itemIds.map((itemId) =>
      env.DB.prepare('INSERT INTO transferencia_itens (transferencia_id, item_id, movido) VALUES (?, ?, 0)').bind(
        id,
        itemId,
      ),
    ),
  ]);

  const origem = await env.DB.prepare('SELECT nome FROM usuarios WHERE id = ?')
    .bind(usuarioId)
    .first<{ nome: string }>();
  await dep.enviarPush(
    env.DB,
    destino.id,
    'Tarefas para você',
    `${origem?.nome ?? 'Alguém'} quer te enviar ${plural(itemIds.length, 'tarefa', 'tarefas')}`,
    id,
    'transferencia',
  );

  return json({
    id,
    status: 'pendente',
    expiraEm,
    quantidade: itemIds.length,
    para: { nome: destino.nome, email: destino.email },
  });
}

/**
 * Aceite: tudo num único batch do D1 (transação — ou acontece tudo, ou nada).
 * O primeiro comando marca a transferência como aceita; todos os seguintes
 * só agem se ESTE aceite foi o que marcou (mesmo respondido_em), então dois
 * toques em "Aceitar" ao mesmo tempo nunca movem nada duas vezes.
 */
async function aceitarTransferencia(
  env: Env,
  transferencia: TransferenciaRow,
  agora: string,
  dep: DependenciasTransferencias,
): Promise<Response> {
  const { json } = dep;
  if (transferencia.status !== 'pendente') return json({ erro: MSG_INDISPONIVEL }, 409);

  const db = env.DB;
  const t = transferencia.id;
  const origem = transferencia.de_usuario_id;
  const destino = transferencia.para_usuario_id;
  // Só as tarefas que este aceite de fato moveu (ver passo 2).
  const MOVIDOS = `SELECT item_id FROM transferencia_itens WHERE transferencia_id = ? AND movido = 1`;

  let resultados: D1Result[];
  try {
    resultados = await db.batch([
      // 1. Marca como aceita (só se ainda pendente e dentro do prazo).
      db
        .prepare(
          `UPDATE transferencias SET status = 'aceita', respondido_em = ?
           WHERE id = ? AND para_usuario_id = ? AND status = 'pendente' AND expira_em > ?`,
        )
        .bind(agora, t, destino, agora),
      // 2. Decide quais tarefas vão: ainda da origem, não apagadas e sem
      //    cifra. Uma tarefa apagada enquanto esperava simplesmente fica.
      db
        .prepare(
          `UPDATE transferencia_itens SET movido = 1
           WHERE transferencia_id = ?
             AND EXISTS (SELECT 1 FROM transferencias WHERE id = ? AND status = 'aceita' AND respondido_em = ?)
             AND item_id IN (
               SELECT id FROM items
               WHERE usuario_id = ? AND excluido = 0
                 AND titulo NOT LIKE 'AVIA1:%' AND texto_original NOT LIKE 'AVIA1:%'
                 AND COALESCE(notas, '') NOT LIKE 'AVIA1:%'
             )`,
        )
        .bind(t, t, agora, origem),
      // 3. Tarefa repetitiva: a regra da repetição vai junto, pra o destino
      //    continuar recebendo as próximas e a origem parar de receber.
      db
        .prepare(
          `UPDATE series_recorrentes SET usuario_id = ?, atualizado_em = ?
           WHERE usuario_id = ? AND id IN (
             SELECT COALESCE(origem_recorrencia_id, id) FROM items WHERE id IN (${MOVIDOS})
           )`,
        )
        .bind(destino, agora, origem, t),
      // 4. Categoria personalizada que o destino não tem: copia (mesmo id,
      //    nome, ícone e cor). Se ele tinha apagado uma de mesmo id, reativa.
      db
        .prepare(
          `INSERT INTO categorias (id, usuario_id, nome, icone, cor, sistema, ordem, criado_em, atualizado_em, excluido)
           SELECT c.id, ?, c.nome, c.icone, c.cor, 0, c.ordem, ?, ?, 0 FROM categorias c
           WHERE c.usuario_id = ? AND c.excluido = 0
             AND c.id IN (SELECT categoria FROM items WHERE id IN (${MOVIDOS}))
           ON CONFLICT(id, usuario_id) DO UPDATE SET excluido = 0, atualizado_em = excluded.atualizado_em
           WHERE categorias.excluido = 1`,
        )
        .bind(destino, agora, agora, origem, t),
      // 5. Se a tarefa estava compartilhada com o próprio destino, a cópia
      //    compartilhada sai (agora ele tem a tarefa de verdade).
      db
        .prepare(
          `UPDATE compartilhamentos SET excluido = 1, atualizado_em = ?
           WHERE criador_id = ? AND destinatario_id = ? AND excluido = 0 AND item_id IN (${MOVIDOS})`,
        )
        .bind(agora, origem, destino, t),
      // 6. Troca o dono. O atualizado_em novo faz os aparelhos do destino
      //    baixarem as tarefas na próxima sincronização.
      db
        .prepare(`UPDATE items SET usuario_id = ?, atualizado_em = ? WHERE usuario_id = ? AND id IN (${MOVIDOS})`)
        .bind(destino, agora, origem, t),
      // 7. Avisa os aparelhos da origem que essas tarefas saíram.
      db
        .prepare(
          `INSERT INTO itens_transferidos (item_id, de_usuario_id, transferido_em)
           SELECT item_id, ?, ? FROM transferencia_itens WHERE transferencia_id = ? AND movido = 1
           ON CONFLICT(item_id, de_usuario_id) DO UPDATE SET transferido_em = excluded.transferido_em`,
        )
        .bind(origem, agora, t),
      // 8. Se alguma dessas tarefas já tinha saído do destino antes (ida e
      //    volta), o aviso antigo de "saiu" não vale mais.
      db.prepare(`DELETE FROM itens_transferidos WHERE de_usuario_id = ? AND item_id IN (${MOVIDOS})`).bind(destino, t),
    ]);
  } catch (erro) {
    console.error('Falha ao aceitar transferência', erro instanceof Error ? erro.name : typeof erro);
    return json({ erro: 'Não foi possível aceitar agora. Tente de novo.' }, 409);
  }

  if (!resultados[0].meta.changes) return json({ erro: MSG_INDISPONIVEL }, 409);

  const contagem = await db
    .prepare('SELECT COUNT(*) AS movidas FROM transferencia_itens WHERE transferencia_id = ? AND movido = 1')
    .bind(t)
    .first<{ movidas: number }>();
  const movidas = contagem?.movidas ?? 0;

  const nomeDestino = await db.prepare('SELECT nome FROM usuarios WHERE id = ?').bind(destino).first<{ nome: string }>();
  await dep.enviarPush(
    db,
    origem,
    'Transferência aceita',
    `${nomeDestino?.nome ?? 'A outra conta'} aceitou ${plural(movidas, 'tarefa sua', 'tarefas suas')}`,
    t,
    'transferencia',
  );

  return json({ ok: true, status: 'aceita', movidas });
}

/**
 * GET /items?since= da ORIGEM: tarefas que saíram desta conta por
 * transferência desde o cursor, no formato de item excluído (o app já sabe
 * apagar). Se a tabela ainda não existir (migração não aplicada), devolve
 * vazio — a sincronização normal nunca pode quebrar por causa disto.
 */
export async function itensQueSairamDaConta(
  db: D1Database,
  usuarioId: string,
  desde: string,
): Promise<{ id: string; atualizadoEm: string }[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT item_id, transferido_em FROM itens_transferidos
         WHERE de_usuario_id = ? AND transferido_em > ?
           AND item_id NOT IN (SELECT id FROM items WHERE usuario_id = ?)
         ORDER BY transferido_em ASC`,
      )
      .bind(usuarioId, desde, usuarioId)
      .all<{ item_id: string; transferido_em: string }>();
    return results.map((r) => ({ id: r.item_id, atualizadoEm: r.transferido_em }));
  } catch {
    return [];
  }
}

/** Exclusão de conta: apaga os registros de transferência da conta (as tarefas já aceitas ficam com quem as recebeu). */
export async function apagarTransferenciasDaConta(db: D1Database, usuarioId: string): Promise<void> {
  try {
    await db.batch([
      db
        .prepare(
          `DELETE FROM transferencia_itens WHERE transferencia_id IN
             (SELECT id FROM transferencias WHERE de_usuario_id = ? OR para_usuario_id = ?)`,
        )
        .bind(usuarioId, usuarioId),
      db.prepare('DELETE FROM transferencias WHERE de_usuario_id = ? OR para_usuario_id = ?').bind(usuarioId, usuarioId),
      db.prepare('DELETE FROM itens_transferidos WHERE de_usuario_id = ?').bind(usuarioId),
    ]);
  } catch {
    // Tabelas ainda não existem (migração não aplicada): nada a apagar.
  }
}
