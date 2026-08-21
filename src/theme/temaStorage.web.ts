// Build web: mesma justificativa de src/auth/tokenStorage.web.ts — localStorage
// direto em vez de expo-secure-store.
const CHAVE = 'avia_tema';

export async function salvarTema(preferencia: string): Promise<void> {
  localStorage.setItem(CHAVE, preferencia);
}

export async function lerTema(): Promise<string | null> {
  return localStorage.getItem(CHAVE);
}
