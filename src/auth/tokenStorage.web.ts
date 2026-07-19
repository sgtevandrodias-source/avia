// Build web: expo-secure-store não tem suporte garantido no navegador —
// usamos localStorage diretamente (aceitável pra PWA de uso pessoal).
const CHAVE = 'avia_sessao';

export async function salvarSessao(dados: string): Promise<void> {
  localStorage.setItem(CHAVE, dados);
}

export async function lerSessao(): Promise<string | null> {
  return localStorage.getItem(CHAVE);
}

export async function limparSessao(): Promise<void> {
  localStorage.removeItem(CHAVE);
}
