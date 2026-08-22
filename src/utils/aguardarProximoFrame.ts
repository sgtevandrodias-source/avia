/**
 * Dá tempo do React pintar o spinner antes de uma chamada síncrona pesada
 * travar a thread JS (ex.: PBKDF2 em src/crypto/dek.ts, ~1-2s numa chamada
 * só). Sem essa pausa entre setProcessando(true) e a chamada pesada, o
 * navegador/RN nunca chega a repintar a tela antes de travar, e o usuário
 * vê o app "não fazer nada" mesmo que termine funcionando depois.
 */
export function aguardarProximoFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}
