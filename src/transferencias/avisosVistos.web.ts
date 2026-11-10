// Build web: mesma ideia de avisosVistos.ts, com localStorage.
const PREFIXO = 'avia_transf_vistos_';
const MAXIMO = 50;

export async function lerAvisosVistos(usuarioId: string): Promise<string[]> {
  try {
    const valor = localStorage.getItem(PREFIXO + usuarioId);
    return valor ? (JSON.parse(valor) as string[]) : [];
  } catch {
    return [];
  }
}

export async function salvarAvisosVistos(usuarioId: string, ids: string[]): Promise<void> {
  try {
    localStorage.setItem(PREFIXO + usuarioId, JSON.stringify(ids.slice(-MAXIMO)));
  } catch {
    // Sem salvar, o pior caso é o aviso aparecer de novo.
  }
}
