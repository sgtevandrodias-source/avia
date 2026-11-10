// Avisa quando o servidor recusa a sessão deste aparelho (HTTP 401). Isso
// acontece quando a senha foi trocada em outro aparelho (o servidor
// desconecta os demais), quando a sessão venceu (90 dias) ou quando a conta
// foi excluída. Antes, o app só parava de sincronizar em silêncio.
//
// Módulo sem React de propósito: é chamado de dentro do sync (nativo) e do
// acesso direto à API (web), que não têm acesso ao contexto. Quem decide o
// que mostrar é o AuthContext, que registra o ouvinte.

type Ouvinte = () => void;

let ouvinte: Ouvinte | null = null;
// Um aviso por sessão: o polling de 20s não pode empilhar alertas.
let jaAvisado = false;

export function aoExpirarSessao(fn: Ouvinte | null): void {
  ouvinte = fn;
}

/** Chamar com toda resposta do servidor que usou o token da sessão ativa. */
export function conferirRespostaDaSessao(resposta: Response): void {
  if (resposta.status !== 401 || jaAvisado) return;
  jaAvisado = true;
  ouvinte?.();
}

/** Chamar sempre que o aparelho passar a usar um token novo (login, troca de conta, troca de senha). */
export function reiniciarAvisoDeSessao(): void {
  jaAvisado = false;
}
