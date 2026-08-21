import * as ExpoCrypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';

// Primitivas de baixo nível (AES-256-GCM + base64) usadas tanto pra cifrar
// os campos de texto quanto pra embrulhar a DEK (ver dek.ts/wireFormat.ts).
// @noble/ciphers e @noble/hashes são puramente JS (sem módulo nativo), então
// funcionam igual no build nativo e no web/PWA sem nenhuma configuração de
// build extra. A aleatoriedade vem sempre do expo-crypto (já é dependência
// do projeto), nunca de crypto.getRandomValues global — o Hermes (RN) não
// garante esse global, então evitamos depender dele.

const TAMANHO_IV = 12; // bytes recomendado pro AES-GCM

export function bytesAleatorios(quantidade: number): Uint8Array {
  return ExpoCrypto.getRandomValues(new Uint8Array(quantidade));
}

const ALFABETO_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesParaBase64(bytes: Uint8Array): string {
  let resultado = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    resultado += ALFABETO_BASE64[b0 >> 2];
    resultado += ALFABETO_BASE64[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    resultado += b1 === undefined ? '=' : ALFABETO_BASE64[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    resultado += b2 === undefined ? '=' : ALFABETO_BASE64[b2 & 0x3f];
  }
  return resultado;
}

export function base64ParaBytes(base64: string): Uint8Array {
  const limpo = base64.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of limpo) {
    const valor = ALFABETO_BASE64.indexOf(char);
    if (valor === -1) continue;
    buffer = (buffer << 6) | valor;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

export interface BytesCifrados {
  iv: Uint8Array;
  cifrado: Uint8Array;
}

export function cifrarBytes(dados: Uint8Array, chave: Uint8Array): BytesCifrados {
  const iv = bytesAleatorios(TAMANHO_IV);
  const cifrado = gcm(chave, iv).encrypt(dados);
  return { iv, cifrado };
}

/** Lança se `chave` estiver errada (tag de autenticação do GCM não bate). */
export function decifrarBytes(iv: Uint8Array, cifrado: Uint8Array, chave: Uint8Array): Uint8Array {
  return gcm(chave, iv).decrypt(cifrado);
}
