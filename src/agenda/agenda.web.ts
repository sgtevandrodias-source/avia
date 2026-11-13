// Build web: não existe calendário do aparelho no navegador. Este stub evita
// importar expo-calendar e expo-sqlite no bundle web, e precisa espelhar a MESMA
// superfície exportada por agenda.ts.
import { CONFIG_AGENDA_PADRAO, type CalendarioGoogle, type ConfigAgenda, type ResultadoPermissaoAgenda } from './tipos';

export function pausarAgenda(): void {}
export function retomarAgenda(): void {}

export function agendaDisponivel(): boolean {
  return false;
}

export async function lerConfigAgenda(): Promise<ConfigAgenda> {
  return CONFIG_AGENDA_PADRAO;
}

export async function lerAvisoAgenda(): Promise<string | null> {
  return null;
}

export async function limparAvisoAgenda(): Promise<void> {}

export async function pedirPermissaoAgenda(): Promise<ResultadoPermissaoAgenda> {
  return { concedida: false, podePedirDeNovo: false };
}

export async function listarCalendariosGoogle(): Promise<CalendarioGoogle[]> {
  return [];
}

export async function ativarAgenda(_calendario: CalendarioGoogle, _aceitouCripto: boolean): Promise<void> {}
export async function desligarAgenda(): Promise<void> {}
export async function sincronizarAgenda(): Promise<void> {}

export async function enviarTarefasExistentes(): Promise<number> {
  return 0;
}

export async function removerEventosDaAgenda(): Promise<number> {
  return 0;
}

export async function decidirEventosAoSair(_usuarioId: string, _contaAtiva: boolean): Promise<boolean> {
  return true;
}
