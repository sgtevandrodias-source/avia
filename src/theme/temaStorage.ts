import * as SecureStore from 'expo-secure-store';

const CHAVE = 'avia_tema';

export async function salvarTema(preferencia: string): Promise<void> {
  await SecureStore.setItemAsync(CHAVE, preferencia);
}

export async function lerTema(): Promise<string | null> {
  return SecureStore.getItemAsync(CHAVE);
}
