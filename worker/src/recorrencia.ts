// Motor de recorrência do servidor — fonte única de verdade a partir de agora.
// Espelha a lógica que antes só existia no cliente (src/utils/recorrencia.ts),
// mas quem decide e grava a próxima ocorrência de cada série passa a ser
// SEMPRE o Worker. Isso elimina a causa raiz da triplicação: antes, cada
// aparelho (celular, computador) gerava a própria ocorrência de forma
// independente, sem saber o que os outros já tinham criado — a sincronização
// só juntava os resultados depois, já duplicados. Agora os aparelhos apenas
// consomem o que o servidor decidiu, nunca inventam a própria ocorrência.
export type Recorrencia = 'nenhuma' | 'anual' | 'mensal' | 'semanal' | 'diaria';

// Sem date-fns de propósito: essa é a única conta de data que o Worker
// precisa fazer, então evitar a dependência mantém o bundle do Worker (edge,
// cold start importa) enxuto. Tudo em UTC, fixado ao meio-dia, pra nunca
// escorregar de dia por causa de fuso horário nos cálculos.
function paraData(dataStr: string): Date {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
}

function paraString(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function proximaDataRecorrencia(dataAtual: string, recorrencia: Recorrencia): string | null {
  const data = paraData(dataAtual);
  switch (recorrencia) {
    case 'diaria':
      data.setUTCDate(data.getUTCDate() + 1);
      return paraString(data);
    case 'semanal':
      data.setUTCDate(data.getUTCDate() + 7);
      return paraString(data);
    case 'mensal':
      data.setUTCMonth(data.getUTCMonth() + 1);
      return paraString(data);
    case 'anual':
      data.setUTCFullYear(data.getUTCFullYear() + 1);
      return paraString(data);
    default:
      return null;
  }
}

const MAX_GERACOES_POR_SERIE = 60;

interface SerieRow {
  id: string;
  usuario_id: string;
  titulo: string;
  texto_original: string;
  categoria: string;
  tipo_horario: string;
  hora_compromisso: string | null;
  hora_limite: string | null;
  recorrencia: Recorrencia;
  lembrete_offset_minutos: number;
  prioridade: number;
  ativa: number;
  recorrencia_gerada_ate: string | null;
  criado_em: string;
  atualizado_em: string;
}

/**
 * Garante que toda série ativa do usuário tem as ocorrências geradas até
 * hoje. Roda no início de todo GET /items (barato: só faz trabalho de
 * verdade quando alguma série está atrasada) e de novo no cron mensal, como
 * reforço. Idempotente: usa serie_chave + data como identidade (protegido
 * também por UNIQUE INDEX no D1, migration 0010) — mesmo que essa função
 * rode em paralelo em duas requisições, a segunda tentativa de criar a
 * mesma ocorrência falha silenciosamente (ON CONFLICT DO NOTHING) em vez
 * de duplicar.
 */
export async function gerarOcorrenciasPendentesNoServidor(db: D1Database, usuarioId: string): Promise<void> {
  const hojeStr = paraString(new Date());

  const { results: series } = await db
    .prepare('SELECT * FROM series_recorrentes WHERE usuario_id = ? AND ativa = 1')
    .bind(usuarioId)
    .all<SerieRow>();

  for (const serie of series) {
    let dataAtual = serie.recorrencia_gerada_ate;
    if (!dataAtual) {
      // Sem bookmark ainda (série recém-migrada ou recém-criada): parte da
      // maior data já existente entre as ocorrências dessa série. Se não
      // existir NENHUMA ocorrência não-excluída (ex.: o usuário apagou todas
      // as ocorrências uma a uma, sem apagar a raiz/série em si), NUNCA cai
      // pra data de criação da série — isso já regenerou meses de tarefas
      // "deletadas" de uma vez no passado. Sem histórico confiável pra
      // retomar, o seguro é só começar a gerar a partir de agora.
      const maior = await db
        .prepare('SELECT MAX(data) as maior FROM items WHERE usuario_id = ? AND serie_chave = ? AND excluido = 0')
        .bind(usuarioId, serie.id)
        .first<{ maior: string | null }>();
      const ontem = new Date();
      ontem.setUTCDate(ontem.getUTCDate() - 1);
      dataAtual = maior?.maior ?? paraString(ontem);
    }

    let geracoes = 0;
    let bookmarkAvancou = false;

    while (geracoes < MAX_GERACOES_POR_SERIE) {
      if (dataAtual >= hojeStr) break;

      const proximaData = proximaDataRecorrencia(dataAtual, serie.recorrencia);
      if (!proximaData) break;

      const agoraIso = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO items (
            id, texto_original, titulo, data, hora_compromisso, hora_limite, tipo_horario,
            categoria, status, recorrencia, lembrete_offset_minutos, prioridade,
            origem_recorrencia_id, serie_chave, recorrencia_gerada_ate, criado_em, concluido_em,
            atualizado_em, excluido, usuario_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?, NULL, ?, NULL, ?, 0, ?)
          ON CONFLICT(usuario_id, serie_chave, data) WHERE excluido = 0 DO NOTHING`,
        )
        .bind(
          crypto.randomUUID(),
          serie.texto_original,
          serie.titulo,
          proximaData,
          serie.hora_compromisso,
          serie.hora_limite,
          serie.tipo_horario,
          serie.categoria,
          serie.recorrencia,
          serie.lembrete_offset_minutos,
          serie.prioridade,
          serie.id,
          serie.id,
          agoraIso,
          agoraIso,
          usuarioId,
        )
        .run();

      dataAtual = proximaData;
      bookmarkAvancou = true;
      geracoes += 1;
    }

    if (bookmarkAvancou) {
      await db
        .prepare(
          `UPDATE series_recorrentes SET recorrencia_gerada_ate = ?, atualizado_em = ?
           WHERE id = ? AND (recorrencia_gerada_ate IS NULL OR recorrencia_gerada_ate < ?)`,
        )
        .bind(dataAtual, new Date().toISOString(), serie.id, dataAtual)
        .run();
    }
  }
}
