// Build web: cada operação já fala direto com a API (ver database.web.ts),
// então não existe estado local pra reconciliar — a maioria das funções é
// no-op. Precisa espelhar a MESMA superfície exportada por sync.ts (tipos e
// funções), senão SettingsScreen/AuthContext importam algo que não existe
// aqui e quebram silenciosamente só no build web (já aconteceu com
// obterStatusSincronizacao — a tela de Configurações ficava em branco).
export interface StatusSincronizacao {
  quando: string;
  ok: boolean;
}

export async function sincronizar(): Promise<{ ok: boolean }> {
  return { ok: true };
}

export async function forcarResyncCompleto(): Promise<void> {}

export async function limparCacheLocalERessincronizar(): Promise<void> {}

export async function prepararSessaoParaUsuario(): Promise<void> {}

export async function alternarSessaoParaUsuario(): Promise<void> {}

// Não há "status da última sincronização" no web: cada leitura já é ao vivo,
// direto do servidor, então não existe um resultado passado pra relatar.
export async function obterStatusSincronizacao(): Promise<StatusSincronizacao | null> {
  return null;
}

export async function redecifrarCacheLocalAposDesbloqueio(): Promise<void> {}
