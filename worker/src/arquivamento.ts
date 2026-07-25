// Sustentabilidade do banco a longo prazo: o D1 "quente" guarda só pendentes
// + concluídos dos últimos JANELA_QUENTE_MESES. Itens concluídos mais
// antigos que isso saem do D1 (caro por GB, teto rígido de 10GB por banco) e
// viram um arquivo JSON por usuário/ano no R2 (barato, sem teto) — nada é
// apagado, só muda de endereço. Pendentes/atrasados NUNCA são elegíveis,
// não importa a idade. Rodado pelo Cron Trigger mensal (ver scheduled() em
// index.ts) e é seguro rodar mais de uma vez (funde com o que já existe).
const JANELA_QUENTE_MESES = 6;

interface ItemArquivavelRow {
  id: string;
  usuario_id: string;
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
  criado_em: string;
  concluido_em: string;
  atualizado_em: string;
}

function dataCorteISO(): string {
  const corte = new Date();
  corte.setUTCMonth(corte.getUTCMonth() - JANELA_QUENTE_MESES);
  return corte.toISOString();
}

export async function arquivarItensAntigos(db: D1Database, bucket: R2Bucket): Promise<void> {
  const corte = dataCorteISO();

  const { results } = await db
    .prepare(
      `SELECT * FROM items
       WHERE status = 'feito' AND excluido = 0 AND concluido_em IS NOT NULL AND concluido_em < ?`,
    )
    .bind(corte)
    .all<ItemArquivavelRow>();

  if (results.length === 0) return;

  const grupos = new Map<string, ItemArquivavelRow[]>();
  for (const row of results) {
    const ano = row.concluido_em.slice(0, 4);
    const chave = `${row.usuario_id}::${ano}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(row);
    grupos.set(chave, lista);
  }

  for (const [chave, itensDoGrupo] of grupos) {
    const [usuarioId, anoStr] = chave.split('::');
    const ano = Number(anoStr);
    const r2Key = `arquivo/${usuarioId}/${ano}.json`;

    // Funde com o que já existe no R2 (ex.: cron já rodou antes pra esse
    // usuário/ano) em vez de sobrescrever.
    const existente = await bucket.get(r2Key);
    const anteriores = existente ? ((await existente.json()) as ItemArquivavelRow[]) : [];
    const combinado = [...anteriores, ...itensDoGrupo];

    const corpo = JSON.stringify(combinado);
    await bucket.put(r2Key, corpo, { httpMetadata: { contentType: 'application/json' } });

    const agora = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO arquivos (id, usuario_id, ano, r2_key, quantidade_itens, tamanho_bytes, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(usuario_id, ano) DO UPDATE SET
           quantidade_itens = excluded.quantidade_itens,
           tamanho_bytes = excluded.tamanho_bytes,
           criado_em = excluded.criado_em`,
      )
      .bind(crypto.randomUUID(), usuarioId, ano, r2Key, combinado.length, corpo.length, agora)
      .run();

    const ids = itensDoGrupo.map((i) => i.id);
    const placeholders = ids.map(() => '?').join(',');
    await db
      .prepare(`DELETE FROM items WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();
  }
}
