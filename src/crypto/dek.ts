import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base64ParaBytes, bytesAleatorios, bytesParaBase64, cifrarBytes, decifrarBytes } from './aesGcm';

// Chave de dados (DEK): uma só, aleatória, gerada uma vez na configuração —
// é ela quem realmente cifra titulo/textoOriginal/notas (ver
// itemCriptografia.ts). Nunca sai do aparelho em forma utilizável.
//
// Duas KEKs (chave derivada da frase-senha e chave derivada do código de
// recuperação) embrulham essa mesma DEK de forma independente — qualquer
// uma das duas destrava os mesmos dados, sem precisar manter duas cópias
// cifradas de cada item (mesmo modelo do Bitwarden/1Password).

export const TAMANHO_CHAVE = 32; // 256 bits
export const ITERACOES_PBKDF2 = 210_000; // OWASP 2023 recomenda >= 600k pra SHA-256, mas isso roda no celular do usuário uma vez só (não a cada requisição) — 210k já é ~10x o mínimo histórico e fica em ~1s num aparelho comum.

export function gerarDek(): Uint8Array {
  return bytesAleatorios(TAMANHO_CHAVE);
}

export function gerarSalt(): Uint8Array {
  return bytesAleatorios(16);
}

export function derivarChaveDeSegredo(segredo: string, salt: Uint8Array, iteracoes = ITERACOES_PBKDF2): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(segredo), salt, { c: iteracoes, dkLen: TAMANHO_CHAVE });
}

export interface DekEmbrulhada {
  saltB64: string;
  dekCifradaB64: string; // IV (12 bytes) + ciphertext+tag, concatenados e depois em base64 — um blob opaco só, igual ao que o servidor guarda (sem coluna de IV separada).
}

const TAMANHO_IV = 12;

function concatenarBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const resultado = new Uint8Array(a.length + b.length);
  resultado.set(a, 0);
  resultado.set(b, a.length);
  return resultado;
}

export function embrulharDek(dek: Uint8Array, segredo: string, iteracoes = ITERACOES_PBKDF2): DekEmbrulhada {
  const salt = gerarSalt();
  const kek = derivarChaveDeSegredo(segredo, salt, iteracoes);
  const { iv, cifrado } = cifrarBytes(dek, kek);
  return { saltB64: bytesParaBase64(salt), dekCifradaB64: bytesParaBase64(concatenarBytes(iv, cifrado)) };
}

/** Retorna `null` se `segredo` estiver errado (tag de autenticação do GCM não bate), nunca lança. */
export function desembrulharDek(embrulhada: DekEmbrulhada, segredo: string, iteracoes = ITERACOES_PBKDF2): Uint8Array | null {
  try {
    const salt = base64ParaBytes(embrulhada.saltB64);
    const kek = derivarChaveDeSegredo(segredo, salt, iteracoes);
    const blob = base64ParaBytes(embrulhada.dekCifradaB64);
    const iv = blob.slice(0, TAMANHO_IV);
    const cifrado = blob.slice(TAMANHO_IV);
    return decifrarBytes(iv, cifrado, kek);
  } catch {
    return null;
  }
}
