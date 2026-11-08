import { Alert, Platform, ToastAndroid } from 'react-native';
import * as Calendar from 'expo-calendar';
import * as SQLite from 'expo-sqlite';
import { format } from 'date-fns';
import { obterChaveAtual } from '../crypto/chaveAtual';
import { estaCifrado } from '../crypto/wireFormat';
import * as db from '../db/database';
import type { Item } from '../types/item';
import {
  assinaturaDoEvento,
  diaInteiroDaAssinatura,
  elegivelParaEvento,
  eventoDoItem,
  type DadosEvento,
} from './mapeamento';
import {
  CONFIG_AGENDA_PADRAO,
  type CalendarioGoogle,
  type ConfigAgenda,
  type ResultadoPermissaoAgenda,
} from './tipos';

// Integração Avia → Google Agenda, só no Android e só em um sentido: grava no
// calendário do aparelho, e o próprio Android sincroniza com a conta Google.
// Fica no arquivo SQLite da conta (a config em sync_meta e os vínculos em
// agenda_vinculos), e nunca vai pro servidor — o vínculo é por aparelho.
//
// Em vez de um gancho em cada ponto que muda uma tarefa, compara o estado das
// tarefas com o que já foi enviado. Assim cobre sozinho as mudanças feitas
// aqui, as que chegam pela sincronização e as tarefas que saem da conta.

const CHAVE_CONFIG = 'agendaConfig';
const CHAVE_AVISO = 'agendaAviso';
const CHAVE_CURSOR_SYNC = 'ultimaSincronizacao';
const TIPO_CONTA_GOOGLE = 'com.google';

const conexoesPreparadas = new WeakSet<SQLite.SQLiteDatabase>();

async function prepararBanco(conexao: SQLite.SQLiteDatabase): Promise<SQLite.SQLiteDatabase> {
  if (!conexoesPreparadas.has(conexao)) {
    await conexao.execAsync(`
      CREATE TABLE IF NOT EXISTS agenda_vinculos (
        item_id TEXT PRIMARY KEY NOT NULL,
        event_id TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        assinatura TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );
    `);
    conexoesPreparadas.add(conexao);
  }
  return conexao;
}

async function bancoDaContaAtiva(): Promise<SQLite.SQLiteDatabase> {
  return prepararBanco(await db.obterBancoLocal());
}

async function lerMeta(conexao: SQLite.SQLiteDatabase, chave: string): Promise<string | null> {
  const linha = await conexao.getFirstAsync<{ valor: string }>('SELECT valor FROM sync_meta WHERE chave = ?', [chave]);
  return linha?.valor ?? null;
}

async function gravarMeta(conexao: SQLite.SQLiteDatabase, chave: string, valor: string): Promise<void> {
  await conexao.runAsync('INSERT OR REPLACE INTO sync_meta (chave, valor) VALUES (?, ?)', [chave, valor]);
}

async function lerConfig(conexao: SQLite.SQLiteDatabase): Promise<ConfigAgenda> {
  const valor = await lerMeta(conexao, CHAVE_CONFIG);
  if (!valor) return CONFIG_AGENDA_PADRAO;
  try {
    return { ...CONFIG_AGENDA_PADRAO, ...(JSON.parse(valor) as Partial<ConfigAgenda>) };
  } catch {
    return CONFIG_AGENDA_PADRAO;
  }
}

async function gravarConfig(conexao: SQLite.SQLiteDatabase, config: ConfigAgenda): Promise<void> {
  await gravarMeta(conexao, CHAVE_CONFIG, JSON.stringify(config));
}

/** Nunca trava o app: desliga a integração e deixa um aviso discreto. */
async function desligarComAviso(conexao: SQLite.SQLiteDatabase, config: ConfigAgenda, aviso: string): Promise<void> {
  await gravarConfig(conexao, { ...config, ativa: false });
  await gravarMeta(conexao, CHAVE_AVISO, aviso);
  if (Platform.OS === 'android') ToastAndroid.show(aviso, ToastAndroid.LONG);
}

// Fila: só uma operação na agenda por vez, pra nunca criar evento duplicado.
let fila: Promise<unknown> = Promise.resolve();
let sincronizacaoNaFila = false;
let pausas = 0;

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = fila.then(tarefa, tarefa);
  fila = execucao.catch(() => {});
  return execucao;
}

/** Suspende a agenda enquanto o cache local é apagado, senão a lista vazia pareceria "todas as tarefas excluídas". */
export function pausarAgenda(): void {
  pausas += 1;
}

export function retomarAgenda(): void {
  pausas = Math.max(0, pausas - 1);
}

export function agendaDisponivel(): boolean {
  return Platform.OS === 'android';
}

export async function lerConfigAgenda(): Promise<ConfigAgenda> {
  return lerConfig(await bancoDaContaAtiva());
}

export async function lerAvisoAgenda(): Promise<string | null> {
  return lerMeta(await bancoDaContaAtiva(), CHAVE_AVISO);
}

export async function limparAvisoAgenda(): Promise<void> {
  await (await bancoDaContaAtiva()).runAsync('DELETE FROM sync_meta WHERE chave = ?', [CHAVE_AVISO]);
}

export async function pedirPermissaoAgenda(): Promise<ResultadoPermissaoAgenda> {
  const resposta = await Calendar.requestCalendarPermissions();
  return { concedida: resposta.granted, podePedirDeNovo: resposta.canAskAgain };
}

/** Só calendários de conta Google e com permissão de escrita: um calendário local nunca chegaria ao Google. */
export async function listarCalendariosGoogle(): Promise<CalendarioGoogle[]> {
  const calendarios = await Calendar.getCalendars();
  return calendarios
    .filter((c) => c.source?.type === TIPO_CONTA_GOOGLE && c.allowsModifications)
    .map((c) => ({ id: c.id, nome: c.title ?? c.source.name, conta: c.source.name }));
}

export async function ativarAgenda(calendario: CalendarioGoogle, aceitouCripto: boolean): Promise<void> {
  await enfileirar(async () => {
    const conexao = await bancoDaContaAtiva();
    await gravarConfig(conexao, {
      ativa: true,
      calendarId: calendario.id,
      calendarNome: calendario.nome,
      contaNome: calendario.conta,
      ativadaEm: new Date().toISOString(),
      aceitouCripto,
    });
    await conexao.runAsync('DELETE FROM sync_meta WHERE chave = ?', [CHAVE_AVISO]);
  });
}

export async function desligarAgenda(): Promise<void> {
  await enfileirar(async () => {
    const conexao = await bancoDaContaAtiva();
    await gravarConfig(conexao, { ...(await lerConfig(conexao)), ativa: false });
  });
}

interface VinculoRow {
  item_id: string;
  event_id: string;
  calendar_id: string;
  assinatura: string;
}

interface ItemAgendaRow {
  id: string;
  titulo: string;
  notas: string | null;
  data: string;
  tipo_horario: Item['tipoHorario'];
  hora_compromisso: string | null;
  hora_limite: string | null;
  status: Item['status'];
  atualizado_em: string;
}

async function gravarVinculo(
  conexao: SQLite.SQLiteDatabase,
  itemId: string,
  eventId: string,
  calendarId: string,
  assinatura: string,
): Promise<void> {
  await conexao.runAsync(
    `INSERT OR REPLACE INTO agenda_vinculos (item_id, event_id, calendar_id, assinatura, atualizado_em)
     VALUES (?, ?, ?, ?, ?)`,
    [itemId, eventId, calendarId, assinatura, new Date().toISOString()],
  );
}

async function criarEvento(calendario: Calendar.ExpoCalendar, evento: DadosEvento): Promise<string> {
  const criado = await calendario.createEvent({
    title: evento.titulo,
    notes: evento.notas,
    startDate: evento.inicio,
    endDate: evento.fim,
    allDay: evento.diaInteiro,
    // Sem alarme: quem avisa é o Avia, e o aviso não pode chegar duplicado.
    alarms: [],
    ...(evento.diaInteiro
      ? // Dia inteiro: o Android exige fuso UTC. E marcado como "livre", pra
        // uma tarefa do dia não deixar a pessoa como ocupada o dia todo.
        { timeZone: 'UTC', endTimeZone: 'UTC', availability: Calendar.Availability.FREE }
      : {}),
  });
  return criado.id;
}

/** `null` quando o evento já não existe (ex.: a pessoa apagou direto na agenda). */
async function buscarEvento(eventId: string): Promise<Calendar.ExpoCalendarEvent | null> {
  try {
    return await Calendar.ExpoCalendarEvent.get(eventId);
  } catch {
    return null;
  }
}

async function apagarEvento(eventId: string): Promise<void> {
  const evento = await buscarEvento(eventId);
  if (evento) await evento.delete();
}

async function calendarioConfigurado(config: ConfigAgenda): Promise<Calendar.ExpoCalendar | null> {
  const calendarios = await Calendar.getCalendars();
  return calendarios.find((c) => c.id === config.calendarId && c.allowsModifications) ?? null;
}

/** Devolve quantos eventos foram criados. */
async function reconciliar(enviarExistentes: boolean): Promise<number> {
  if (!agendaDisponivel() || pausas > 0) return 0;

  // Tudo vem desta mesma conexão de propósito: ler as tarefas de uma conta e os
  // vínculos de outra, durante uma troca de conta, apagaria os eventos.
  const conexao = await bancoDaContaAtiva();
  const config = await lerConfig(conexao);
  if (!config.ativa || !config.calendarId) return 0;

  if (obterChaveAtual() && !config.aceitouCripto) {
    // A criptografia foi ligada depois da agenda: sem confirmar de novo, o
    // título e as notas não podem continuar saindo em texto aberto.
    await desligarComAviso(
      conexao,
      config,
      'Google Agenda desligada: a criptografia foi ativada. Ligue de novo para confirmar o envio.',
    );
    return 0;
  }

  // Sem cursor, esta conta ainda não terminou de baixar as tarefas. Uma lista
  // incompleta faria os eventos parecerem órfãos.
  if (!(await lerMeta(conexao, CHAVE_CURSOR_SYNC))) return 0;

  const itens = await conexao.getAllAsync<ItemAgendaRow>(
    `SELECT id, titulo, notas, data, tipo_horario, hora_compromisso, hora_limite, status, atualizado_em FROM items`,
  );
  const vinculos = await conexao.getAllAsync<VinculoRow>(
    'SELECT item_id, event_id, calendar_id, assinatura FROM agenda_vinculos',
  );
  if (pausas > 0) return 0;

  const vinculoPorItem = new Map(vinculos.map((v) => [v.item_id, v]));
  const idsItens = new Set(itens.map((i) => i.id));
  const hoje = format(new Date(), 'yyyy-MM-dd');
  const ativadaEm = config.ativadaEm ?? '';

  const operacoes: { itemId: string; evento: DadosEvento | null; vinculo?: VinculoRow; assinatura: string }[] = [];
  for (const vinculo of vinculos) {
    if (!idsItens.has(vinculo.item_id)) {
      operacoes.push({ itemId: vinculo.item_id, evento: null, vinculo, assinatura: '' });
    }
  }
  for (const row of itens) {
    // Aparelho bloqueado: o título ainda é texto cifrado e nunca pode virar evento.
    if (estaCifrado(row.titulo) || estaCifrado(row.notas)) continue;
    const evento = eventoDoItem({
      titulo: row.titulo,
      notas: row.notas,
      data: row.data,
      tipoHorario: row.tipo_horario,
      horaCompromisso: row.hora_compromisso,
      horaLimite: row.hora_limite,
      status: row.status,
    });
    if (!evento) continue;
    const assinatura = assinaturaDoEvento(evento);
    const vinculo = vinculoPorItem.get(row.id);
    if (vinculo) {
      if (vinculo.calendar_id !== config.calendarId || vinculo.assinatura !== assinatura) {
        operacoes.push({ itemId: row.id, evento, vinculo, assinatura });
      }
    } else if (
      elegivelParaEvento(row, hoje) &&
      (enviarExistentes || row.atualizado_em >= ativadaEm)
    ) {
      operacoes.push({ itemId: row.id, evento, assinatura });
    }
  }
  if (operacoes.length === 0) return 0;

  const permissao = await Calendar.getCalendarPermissions();
  if (!permissao.granted) {
    await desligarComAviso(conexao, config, 'Google Agenda desligada: o Avia perdeu a permissão de acessar o calendário.');
    return 0;
  }
  const calendario = await calendarioConfigurado(config);
  if (!calendario) {
    await desligarComAviso(conexao, config, 'Google Agenda desligada: o calendário escolhido não está mais disponível.');
    return 0;
  }

  let criados = 0;
  for (const { itemId, evento, vinculo, assinatura } of operacoes) {
    // Trocou de conta ou começou a limpar o cache no meio do caminho: para.
    if (pausas > 0 || (await db.obterBancoLocal()) !== conexao) return criados;

    let novoEventId: string | null = null;
    try {
      if (!evento) {
        await apagarEvento(vinculo!.event_id);
      } else if (!vinculo) {
        novoEventId = await criarEvento(calendario, evento);
        criados += 1;
      } else {
        const existente = await buscarEvento(vinculo.event_id);
        // Trocar entre dia inteiro e horário muda o fuso exigido pelo Android,
        // então é mais seguro recriar do que atualizar o evento.
        const podeAtualizar =
          existente &&
          vinculo.calendar_id === config.calendarId &&
          diaInteiroDaAssinatura(vinculo.assinatura) === evento.diaInteiro;
        if (podeAtualizar) {
          await existente.update({
            title: evento.titulo,
            notes: evento.notas,
            startDate: evento.inicio,
            endDate: evento.fim,
          });
          novoEventId = vinculo.event_id;
        } else {
          if (existente) await existente.delete();
          novoEventId = await criarEvento(calendario, evento);
        }
      }
    } catch {
      // Uma tarefa com problema não pode bloquear as outras — a não ser que o
      // erro venha de ter perdido o acesso, e aí não adianta insistir.
      const acesso = await Calendar.getCalendarPermissions().catch(() => null);
      const aindaExiste = acesso?.granted ? await calendarioConfigurado(config).catch(() => null) : null;
      if (!aindaExiste) {
        await desligarComAviso(conexao, config, 'Google Agenda desligada: não foi possível acessar o calendário.');
        return criados;
      }
      continue;
    }

    if (!evento) {
      await conexao.runAsync('DELETE FROM agenda_vinculos WHERE item_id = ?', [itemId]);
    } else if (novoEventId) {
      await gravarVinculo(conexao, itemId, novoEventId, config.calendarId, assinatura);
    }
  }
  return criados;
}

/** Atualiza a agenda com o estado atual das tarefas. Nunca lança erro. */
export async function sincronizarAgenda(): Promise<void> {
  if (!agendaDisponivel() || sincronizacaoNaFila) return;
  sincronizacaoNaFila = true;
  try {
    await enfileirar(async () => {
      sincronizacaoNaFila = false;
      await reconciliar(false);
    });
  } catch {
    // Agenda nunca derruba o app — tenta de novo na próxima sincronização.
  } finally {
    sincronizacaoNaFila = false;
  }
}

/** Devolve quantos eventos foram criados. */
export async function enviarTarefasExistentes(): Promise<number> {
  return enfileirar(() => reconciliar(true));
}

async function apagarEventosDaConexao(conexao: SQLite.SQLiteDatabase): Promise<number> {
  const vinculos = await conexao.getAllAsync<VinculoRow>(
    'SELECT item_id, event_id, calendar_id, assinatura FROM agenda_vinculos',
  );
  if (vinculos.length > 0) {
    const permissao = await Calendar.requestCalendarPermissions();
    if (!permissao.granted) throw new Error('Sem permissão para acessar o calendário.');
  }
  let removidos = 0;
  for (const vinculo of vinculos) {
    await apagarEvento(vinculo.event_id);
    await conexao.runAsync('DELETE FROM agenda_vinculos WHERE item_id = ?', [vinculo.item_id]);
    removidos += 1;
  }
  // Desliga junto: ficar ligada faria os eventos voltarem na próxima sincronização.
  await gravarConfig(conexao, { ...(await lerConfig(conexao)), ativa: false });
  return removidos;
}

/** Remove da agenda todos os eventos criados pelo Avia neste aparelho e desliga a integração. */
export async function removerEventosDaAgenda(): Promise<number> {
  return enfileirar(async () => apagarEventosDaConexao(await bancoDaContaAtiva()));
}

async function comBancoDaConta<T>(
  usuarioId: string,
  contaAtiva: boolean,
  uso: (conexao: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  if (contaAtiva) return uso(await bancoDaContaAtiva());
  // Conta salva, mas que não está em uso agora: abre o arquivo dela só pra isso.
  const conexao = await prepararBanco(await SQLite.openDatabaseAsync(`avia_${usuarioId}.db`));
  try {
    return await uso(conexao);
  } finally {
    await conexao.closeAsync().catch(() => {});
  }
}

/**
 * Sair da conta apaga os vínculos junto com o banco local: os eventos ficariam
 * órfãos na agenda e duplicariam ao entrar de novo. Por isso pergunta antes.
 * Devolve `false` se a pessoa desistiu de sair.
 */
export async function decidirEventosAoSair(usuarioId: string, contaAtiva: boolean): Promise<boolean> {
  if (!agendaDisponivel()) return true;

  let quantidade = 0;
  try {
    quantidade = await comBancoDaConta(usuarioId, contaAtiva, async (conexao) => {
      const linha = await conexao.getFirstAsync<{ total: number }>('SELECT COUNT(*) as total FROM agenda_vinculos');
      return linha?.total ?? 0;
    });
  } catch {
    return true;
  }
  if (quantidade === 0) return true;

  return new Promise<boolean>((resolver) => {
    Alert.alert(
      'Eventos na Google Agenda',
      `Esta conta tem ${quantidade} evento(s) criados pelo Avia na sua agenda. Deseja removê-los antes de sair?`,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => resolver(false) },
        { text: 'Manter', onPress: () => resolver(true) },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => {
            enfileirar(() => comBancoDaConta(usuarioId, contaAtiva, apagarEventosDaConexao))
              .catch(() => {
                if (Platform.OS === 'android') {
                  ToastAndroid.show('Não foi possível remover todos os eventos da agenda.', ToastAndroid.LONG);
                }
              })
              .finally(() => resolver(true));
          },
        },
      ],
    );
  });
}
