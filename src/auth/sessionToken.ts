// Ponte simples entre AuthContext (componente React) e sync.ts (módulo
// puro, sem acesso a hooks) pra saber qual token usar nas chamadas à API.
let tokenAtual: string | null = null;

export function definirTokenAtual(token: string | null): void {
  tokenAtual = token;
}

export function obterTokenAtual(): string | null {
  return tokenAtual;
}
