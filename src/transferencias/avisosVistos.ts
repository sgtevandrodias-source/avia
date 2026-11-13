import * as SecureStore from 'expo-secure-store';

// Quais respostas de transferência ("Fulano aceitou suas 5 tarefas") o
// usuário já dispensou neste aparelho — por conta, pra não repetir o aviso.
const PREFIXO = 'avia_transf_vistos_';
const MAXIMO = 50;

export async function lerAvisosVistos(usuarioId: string): Promise<string[]> {
  try {
    const valor = await SecureStore.getItemAsync(PREFIXO + usuarioId);
    return valor ? (JSON.parse(valor) as string[]) : [];
  } catch {
    return [];
  }
}

export async function salvarAvisosVistos(usuarioId: string, ids: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(PREFIXO + usuarioId, JSON.stringify(ids.slice(-MAXIMO)));
  } catch {
    // Sem salvar, o pior caso é o aviso aparecer de novo.
  }
}
