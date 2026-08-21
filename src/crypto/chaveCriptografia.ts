import * as SecureStore from 'expo-secure-store';
import { base64ParaBytes, bytesParaBase64 } from './aesGcm';

// Cache local da DEK já destravada, pra não pedir a frase-senha/código de
// recuperação toda vez que o app abre — mesmo padrão de src/auth/tokenStorage.ts,
// mas com uma chave por usuário (um aparelho pode passar por mais de uma
// conta ao longo do tempo, ver prepararSessaoParaUsuario em src/sync/sync.ts).
const PREFIXO_CHAVE = 'avia_chave_cripto_';
const PREFIXO_AVISO_DISPENSADO = 'avia_cripto_aviso_dispensado_';

export async function salvarChaveLocal(usuarioId: string, chave: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(PREFIXO_CHAVE + usuarioId, bytesParaBase64(chave));
}

export async function lerChaveLocal(usuarioId: string): Promise<Uint8Array | null> {
  const valor = await SecureStore.getItemAsync(PREFIXO_CHAVE + usuarioId);
  return valor ? base64ParaBytes(valor) : null;
}

export async function limparChaveLocal(usuarioId: string): Promise<void> {
  await SecureStore.deleteItemAsync(PREFIXO_CHAVE + usuarioId);
}

export async function salvarAvisoDispensado(usuarioId: string): Promise<void> {
  await SecureStore.setItemAsync(PREFIXO_AVISO_DISPENSADO + usuarioId, '1');
}

export async function foiAvisoDispensado(usuarioId: string): Promise<boolean> {
  return (await SecureStore.getItemAsync(PREFIXO_AVISO_DISPENSADO + usuarioId)) === '1';
}
