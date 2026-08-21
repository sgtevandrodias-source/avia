// Ponte simples entre o contexto de auth (componente React) e os módulos
// puros que cifram/decifram itens (sync.ts, database.web.ts) — mesmo padrão
// de src/auth/sessionToken.ts, só que pra DEK em vez do token de sessão.
let chaveAtual: Uint8Array | null = null;

export function definirChaveAtual(chave: Uint8Array | null): void {
  chaveAtual = chave;
}

export function obterChaveAtual(): Uint8Array | null {
  return chaveAtual;
}
