import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { campoOuBloqueado } from '../crypto/itemCriptografia';
import type { Item } from '../types/item';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function solicitarPermissaoNotificacoes(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

function horarioDoItem(item: Item): { hora: number; minuto: number } {
  const horaRef = item.tipoHorario === 'compromisso' ? item.horaCompromisso : item.horaLimite;
  if (horaRef) {
    const [hora, minuto] = horaRef.split(':').map(Number);
    return { hora, minuto };
  }
  return { hora: 9, minuto: 0 }; // itens sem horário: lembrete padrão às 9h
}

export function calcularDisparoNotificacao(item: Item): Date | null {
  const [ano, mes, dia] = item.data.split('-').map(Number);
  const { hora, minuto } = horarioDoItem(item);
  const disparo = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
  const disparoComOffset = new Date(disparo.getTime() - item.lembreteOffsetMinutos * 60_000);
  return disparoComOffset > new Date() ? disparoComOffset : null;
}

export async function agendarNotificacaoDoItem(item: Item): Promise<string | null> {
  if (item.status === 'feito') return null;
  const disparo = calcularDisparoNotificacao(item);
  if (!disparo) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: campoOuBloqueado(item.titulo) ?? item.titulo,
      body:
        item.tipoHorario === 'compromisso'
          ? `Compromisso às ${item.horaCompromisso}`
          : item.tipoHorario === 'prazo'
            ? `Prazo até ${item.horaLimite}`
            : item.tipoHorario === 'dia_todo'
              ? 'Evento do dia todo'
              : 'Lembrete do AVIA',
      data: { itemId: item.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: disparo,
    },
  });
}

export async function cancelarNotificacoesDoItem(itemId: string): Promise<void> {
  const agendadas = await Notifications.getAllScheduledNotificationsAsync();
  const doItem = agendadas.filter((n) => n.content.data?.itemId === itemId);
  await Promise.all(doItem.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

export async function reagendarNotificacaoDoItem(item: Item): Promise<void> {
  await cancelarNotificacoesDoItem(item.id);
  await agendarNotificacaoDoItem(item);
}

/**
 * Zera TODO lembrete agendado no aparelho e reagenda do zero, só pros itens
 * pendentes de verdade. Roda uma vez a cada abertura do app (ver
 * ItemsContext) — é o que garante que lembrete de item apagado/duplicado por
 * algum bug antigo nunca fique "fantasma" preso no sistema operacional pra
 * sempre; a cada abertura o agendado reflete exatamente a lista atual.
 */
export async function reconciliarNotificacoes(itensPendentes: Item[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Promise.all(itensPendentes.map((item) => agendarNotificacaoDoItem(item).catch(() => {})));
}

export function configurarCanalAndroid() {
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'AVIA',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#FF5C33',
    });
  }
}
