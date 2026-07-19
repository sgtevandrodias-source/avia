// Build web: notificações locais agendadas não têm suporte real em
// navegador. Este stub evita importar expo-notifications no bundle web
// (seu setup interno de handler pode falhar silenciosamente no boot).
import type { Item } from '../types/item';

export async function solicitarPermissaoNotificacoes(): Promise<boolean> {
  return false;
}

export function calcularDisparoNotificacao(_item: Item): Date | null {
  return null;
}

export async function agendarNotificacaoDoItem(_item: Item): Promise<string | null> {
  return null;
}

export async function cancelarNotificacoesDoItem(_itemId: string): Promise<void> {}

export async function reagendarNotificacaoDoItem(_item: Item): Promise<void> {}

export function configurarCanalAndroid(): void {}
