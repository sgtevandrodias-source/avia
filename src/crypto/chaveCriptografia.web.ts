// Build web: mesmo raciocínio de src/auth/tokenStorage.web.ts — sem suporte
// garantido a expo-secure-store no navegador, usamos localStorage direto
// (aceitável pra PWA de uso pessoal).
import { base64ParaBytes, bytesParaBase64 } from './aesGcm';

const PREFIXO_CHAVE = 'avia_chave_cripto_';
const PREFIXO_AVISO_DISPENSADO = 'avia_cripto_aviso_dispensado_';

export async function salvarChaveLocal(usuarioId: string, chave: Uint8Array): Promise<void> {
  localStorage.setItem(PREFIXO_CHAVE + usuarioId, bytesParaBase64(chave));
}

export async function lerChaveLocal(usuarioId: string): Promise<Uint8Array | null> {
  const valor = localStorage.getItem(PREFIXO_CHAVE + usuarioId);
  return valor ? base64ParaBytes(valor) : null;
}

export async function limparChaveLocal(usuarioId: string): Promise<void> {
  localStorage.removeItem(PREFIXO_CHAVE + usuarioId);
}

export async function salvarAvisoDispensado(usuarioId: string): Promise<void> {
  localStorage.setItem(PREFIXO_AVISO_DISPENSADO + usuarioId, '1');
}

export async function foiAvisoDispensado(usuarioId: string): Promise<boolean> {
  return localStorage.getItem(PREFIXO_AVISO_DISPENSADO + usuarioId) === '1';
}
