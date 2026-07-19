import * as SecureStore from 'expo-secure-store';

const CHAVE = 'avia_sessao';

export async function salvarSessao(dados: string): Promise<void> {
  await SecureStore.setItemAsync(CHAVE, dados);
}

export async function lerSessao(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE);
}

export async function limparSessao(): Promise<void> {
  await SecureStore.deleteItemAsync(CHAVE);
}
