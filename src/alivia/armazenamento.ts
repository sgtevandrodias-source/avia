import type * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import * as db from '../db/database';
import { obterChaveAtual } from '../crypto/chaveAtual';
import { estaCifrado } from '../crypto/wireFormat';
import { chamarApiAlivia, decifrarRecebido, enviarPensamento, type PensamentoRemoto } from './api';
import type { Pensamento } from './tipos';

// Nativo: offline-first, igual às tarefas — o registro é salvo primeiro no
// SQLite da conta (funciona sem internet) e vai pro servidor depois, em
// sincronizarPensamentos(). Tabela e cursor PRÓPRIOS: essa sincronização é
// independente da de tarefas (src/sync/sync.ts não foi alterado), então uma
// falha aqui nunca atrapalha as tarefas, e vice-versa.

const CHAVE_CURSOR = 'ultimaSincronizacaoPensamentos';

// Cada conta tem seu próprio arquivo SQLite (ver definirUsuarioAtivo em
// database.ts) — a tabela é garantida uma vez por conexão aberta.
const conexoesPreparadas = new WeakSet<SQLite.SQLiteDatabase>();

async function banco(): Promise<SQLite.SQLiteDatabase> {
  const conexao = await db.obterBancoLocal();
  if (!conexoesPreparadas.has(conexao)) {
    await conexao.execAsync(`
      CREATE TABLE IF NOT EXISTS pensamentos (
        id TEXT PRIMARY KEY NOT NULL,
        texto TEXT NOT NULL,
        registrado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        excluido INTEGER NOT NULL DEFAULT 0,
        pendente_envio INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_pensamentos_registrado ON pensamentos(registrado_em);
    `);
    // Coluna acrescentada na versão com título — aparelhos que já tinham a
    // tabela (app 1.1.0) ganham a coluna vazia; nada existente é alterado.
    const colunas = await conexao.getAllAsync<{ name: string }>('PRAGMA table_info(pensamentos)');
    if (!colunas.some((c) => c.name === 'titulo')) {
      await conexao.execAsync("ALTER TABLE pensamentos ADD COLUMN titulo TEXT NOT NULL DEFAULT ''");
    }
    conexoesPreparadas.add(conexao);
  }
  return conexao;
}

interface PensamentoRow {
  id: string;
  titulo: string;
  texto: string;
  registrado_em: string;
  atualizado_em: string;
  excluido: number;
  pendente_envio: number;
}

function rowParaPensamento(row: PensamentoRow): Pensamento {
  // Decifra na leitura: um registro puxado enquanto o aparelho estava
  // bloqueado fica salvo cifrado e passa a aparecer normal assim que a
  // criptografia é desbloqueada, sem precisar sincronizar de novo.
  const texto = decifrarRecebido(row.texto);
  const titulo = decifrarRecebido(row.titulo);
  return {
    id: row.id,
    titulo: titulo.texto,
    texto: texto.texto,
    registradoEm: row.registrado_em,
    atualizadoEm: row.atualizado_em,
    bloqueado: texto.bloqueado || titulo.bloqueado,
  };
}

export async function listarPensamentos(): Promise<Pensamento[]> {
  const conexao = await banco();
  const rows = await conexao.getAllAsync<PensamentoRow>(
    'SELECT * FROM pensamentos WHERE excluido = 0 ORDER BY registrado_em DESC',
  );
  return rows.map(rowParaPensamento);
}

export async function criarPensamento(titulo: string, texto: string): Promise<Pensamento> {
  const conexao = await banco();
  const agora = new Date().toISOString();
  const pensamento: Pensamento = { id: Crypto.randomUUID(), titulo, texto, registradoEm: agora, atualizadoEm: agora };
  await conexao.runAsync(
    `INSERT INTO pensamentos (id, titulo, texto, registrado_em, atualizado_em, excluido, pendente_envio)
     VALUES (?, ?, ?, ?, ?, 0, 1)`,
    [pensamento.id, titulo, texto, agora, agora],
  );
  return pensamento;
}

export async function editarPensamento(id: string, titulo: string, texto: string): Promise<void> {
  const conexao = await banco();
  await conexao.runAsync(
    'UPDATE pensamentos SET titulo = ?, texto = ?, atualizado_em = ?, pendente_envio = 1 WHERE id = ?',
    [titulo, texto, new Date().toISOString(), id],
  );
}

export async function apagarPensamento(id: string): Promise<void> {
  const conexao = await banco();
  // Marca como excluído (em vez de apagar a linha) pra exclusão também
  // chegar ao servidor e aos outros aparelhos na próxima sincronização.
  await conexao.runAsync(
    'UPDATE pensamentos SET excluido = 1, atualizado_em = ?, pendente_envio = 1 WHERE id = ?',
    [new Date().toISOString(), id],
  );
}

async function enviarPendentes(conexao: SQLite.SQLiteDatabase): Promise<void> {
  const pendentes = await conexao.getAllAsync<PensamentoRow>('SELECT * FROM pensamentos WHERE pendente_envio = 1');
  for (const row of pendentes) {
    await enviarPensamento({
      id: row.id,
      titulo: row.titulo,
      texto: row.texto,
      registradoEm: row.registrado_em,
      atualizadoEm: row.atualizado_em,
      excluido: row.excluido === 1,
    });
    // Só limpa a pendência se ninguém editou de novo enquanto enviava.
    await conexao.runAsync('UPDATE pensamentos SET pendente_envio = 0 WHERE id = ? AND atualizado_em = ?', [
      row.id,
      row.atualizado_em,
    ]);
    if (row.excluido === 1) {
      await conexao.runAsync('DELETE FROM pensamentos WHERE id = ? AND excluido = 1 AND pendente_envio = 0', [row.id]);
    }
  }
}

async function receberAlteracoes(conexao: SQLite.SQLiteDatabase): Promise<void> {
  const desde = await db.getMeta(CHAVE_CURSOR);
  const { pensamentos, servidorEm } = await chamarApiAlivia<{ pensamentos: PensamentoRemoto[]; servidorEm: string }>(
    desde ? `/pensamentos?since=${encodeURIComponent(desde)}` : '/pensamentos',
  );
  const temChave = obterChaveAtual() != null;

  for (const remoto of pensamentos) {
    const local = await conexao.getFirstAsync<PensamentoRow>('SELECT * FROM pensamentos WHERE id = ?', [remoto.id]);
    // Last write wins: alteração local ainda não enviada e mais nova vence.
    if (local && local.pendente_envio === 1 && local.atualizado_em >= remoto.atualizadoEm) continue;

    if (remoto.excluido) {
      await conexao.runAsync('DELETE FROM pensamentos WHERE id = ?', [remoto.id]);
      continue;
    }
    const tituloRemoto = remoto.titulo ?? '';
    const texto = decifrarRecebido(remoto.texto);
    const titulo = decifrarRecebido(tituloRemoto);
    // Registro antigo ainda em texto puro no servidor e este aparelho já
    // tem a chave (a pessoa ativou a criptografia depois) — reenvia cifrado,
    // com o mesmo atualizadoEm (o Worker aceita, ver pensamentos.ts).
    const precisaCifrar =
      temChave && (!estaCifrado(remoto.texto) || (tituloRemoto !== '' && !estaCifrado(tituloRemoto)));
    await conexao.runAsync(
      `INSERT INTO pensamentos (id, titulo, texto, registrado_em, atualizado_em, excluido, pendente_envio)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         titulo = excluded.titulo,
         texto = excluded.texto,
         registrado_em = excluded.registrado_em,
         atualizado_em = excluded.atualizado_em,
         excluido = 0,
         pendente_envio = excluded.pendente_envio`,
      [
        remoto.id,
        titulo.bloqueado ? tituloRemoto : titulo.texto,
        texto.bloqueado ? remoto.texto : texto.texto,
        remoto.registradoEm,
        remoto.atualizadoEm,
        precisaCifrar ? 1 : 0,
      ],
    );
  }
  await db.setMeta(CHAVE_CURSOR, servidorEm);
}

let sincronizando: Promise<boolean> | null = null;

/**
 * Envia o que foi registrado/alterado neste aparelho e traz o que mudou no
 * servidor. Nunca lança: sem internet (ou com a rota fora do ar), devolve
 * false e tudo continua salvo localmente pra próxima tentativa.
 * `podeEnviar` = false quando a conta tem criptografia configurada mas este
 * aparelho ainda está bloqueado: nesse caso NÃO envia nada (iria em texto
 * puro), só recebe — os registros novos esperam o desbloqueio.
 */
export function sincronizarPensamentos({ podeEnviar }: { podeEnviar: boolean }): Promise<boolean> {
  if (!sincronizando) {
    sincronizando = (async () => {
      try {
        const conexao = await banco();
        if (podeEnviar) await enviarPendentes(conexao);
        await receberAlteracoes(conexao);
        if (podeEnviar) await enviarPendentes(conexao);
        return true;
      } catch {
        return false;
      } finally {
        sincronizando = null;
      }
    })();
  }
  return sincronizando;
}
