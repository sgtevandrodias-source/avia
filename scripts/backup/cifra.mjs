// Cifra/decifra os pacotes de backup do Avia (AES-256-GCM, chave derivada
// da senha com scrypt). Formato do arquivo .aviabkp:
//   "AVIABKP1" (8 bytes) | salt (16) | iv (12) | dados cifrados | tag (16)
// Sem a senha não há como abrir — nem pra quem tem acesso ao Google Drive.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const MAGICO = Buffer.from('AVIABKP1');
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function derivarChave(senha, salt) {
  return scryptSync(senha, salt, 32, SCRYPT);
}

export function cifrar(dados, senha) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cifra = createCipheriv('aes-256-gcm', derivarChave(senha, salt), iv);
  const corpo = Buffer.concat([cifra.update(dados), cifra.final()]);
  return Buffer.concat([MAGICO, salt, iv, corpo, cifra.getAuthTag()]);
}

export function decifrar(arquivo, senha) {
  if (arquivo.length < 8 + 16 + 12 + 16 || !arquivo.subarray(0, 8).equals(MAGICO)) {
    throw new Error('Este arquivo não é um backup do Avia.');
  }
  const salt = arquivo.subarray(8, 24);
  const iv = arquivo.subarray(24, 36);
  const tag = arquivo.subarray(arquivo.length - 16);
  const corpo = arquivo.subarray(36, arquivo.length - 16);
  const decifra = createDecipheriv('aes-256-gcm', derivarChave(senha, salt), iv);
  decifra.setAuthTag(tag);
  try {
    return Buffer.concat([decifra.update(corpo), decifra.final()]);
  } catch {
    throw new Error('Senha errada ou arquivo danificado.');
  }
}
