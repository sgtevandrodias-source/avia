// Tipos compartilhados entre agenda.ts (Android) e agenda.web.ts (stub).

export interface ConfigAgenda {
  ativa: boolean;
  calendarId: string | null;
  calendarNome: string | null;
  contaNome: string | null;
  // A partir de quando tarefas novas/alteradas vão sozinhas pra agenda. O que
  // já existia antes só vai pelo botão "Enviar tarefas existentes agora".
  ativadaEm: string | null;
  // O usuário já confirmou que título e notas saem sem criptografia.
  aceitouCripto: boolean;
}

export const CONFIG_AGENDA_PADRAO: ConfigAgenda = {
  ativa: false,
  calendarId: null,
  calendarNome: null,
  contaNome: null,
  ativadaEm: null,
  aceitouCripto: false,
};

export interface CalendarioGoogle {
  id: string;
  nome: string;
  conta: string;
}

export interface ResultadoPermissaoAgenda {
  concedida: boolean;
  podePedirDeNovo: boolean;
}
