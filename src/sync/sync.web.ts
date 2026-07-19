// Build web: cada operação já fala direto com a API (ver database.web.ts),
// então não existe estado local pra reconciliar — sincronizar() é um no-op.
export async function sincronizar(): Promise<{ ok: boolean }> {
  return { ok: true };
}
