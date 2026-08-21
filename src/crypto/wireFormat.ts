import { utf8ToBytes } from '@noble/hashes/utils.js';
import { base64ParaBytes, bytesParaBase64, cifrarBytes, decifrarBytes } from './aesGcm';

// Formato do texto cifrado que substitui o valor em texto puro dos campos
// titulo/textoOriginal/notas, sem precisar de nenhuma mudança de schema —
// pro Worker e pro D1 continua sendo só uma string qualquer (ver
// worker/src/index.ts, recorrencia.ts, arquivamento.ts: nenhum dos três lê o
// conteúdo desses campos, só copia/move como string opaca).
const PREFIXO = 'AVIA1:';

const DECODIFICADOR_TEXTO = new TextDecoder();

export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

export function cifrarTexto(texto: string, chave: Uint8Array): string {
  const { iv, cifrado } = cifrarBytes(utf8ToBytes(texto), chave);
  return `${PREFIXO}${bytesParaBase64(iv)}:${bytesParaBase64(cifrado)}`;
}

/** Lança se `valor` não estiver no formato esperado ou se `chave` estiver errada. */
export function decifrarTexto(valor: string, chave: Uint8Array): string {
  if (!estaCifrado(valor)) {
    throw new Error('Valor não está no formato cifrado esperado.');
  }
  const partes = valor.slice(PREFIXO.length).split(':');
  if (partes.length !== 2) {
    throw new Error('Valor cifrado malformado.');
  }
  const [ivB64, cifradoB64] = partes;
  const bytes = decifrarBytes(base64ParaBytes(ivB64), base64ParaBytes(cifradoB64), chave);
  return DECODIFICADOR_TEXTO.decode(bytes);
}
