import { bytesAleatorios } from './aesGcm';

// Código de recuperação: uma string com bastante entropia, mostrada uma
// única vez na configuração, que o próprio usuário guarda em local seguro.
// É tratado como um segredo alternativo à frase-senha — nunca é decodificado
// de volta pra bytes, só usado como texto de entrada do PBKDF2 (ver dek.ts),
// exatamente como a frase-senha.
//
// Alfabeto de 32 símbolos (sem 0/O, 1/I/L/U pra evitar confusão visual) —
// 256 % 32 === 0, então sortear um caractere por byte aleatório não tem
// nenhum viés estatístico.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const CARACTERES_POR_GRUPO = 4;
const GRUPOS = 6; // 24 caracteres úteis * log2(31) ≈ 118 bits de entropia

export function gerarCodigoRecuperacao(): string {
  const totalCaracteres = CARACTERES_POR_GRUPO * GRUPOS;
  const aleatorios = bytesAleatorios(totalCaracteres);
  let bruto = '';
  for (let i = 0; i < totalCaracteres; i++) {
    bruto += ALFABETO[aleatorios[i] % ALFABETO.length];
  }
  const grupos: string[] = [];
  for (let i = 0; i < bruto.length; i += CARACTERES_POR_GRUPO) {
    grupos.push(bruto.slice(i, i + CARACTERES_POR_GRUPO));
  }
  return grupos.join('-');
}

/** Normaliza o que o usuário digitou (maiúsculas, sem espaços) antes de usar como segredo do PBKDF2. */
export function normalizarCodigoRecuperacao(valor: string): string {
  return valor.trim().toUpperCase().replace(/\s+/g, '');
}
