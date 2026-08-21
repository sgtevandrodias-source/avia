import { obterTokenAtual } from '../auth/sessionToken';
import { API_URL } from '../sync/config';

// Chamadas HTTP pro envelope de criptografia (ver worker/src/index.ts,
// rotas GET/PUT /usuario/cifra). O envelope em si é só blobs cifrados +
// salts — o servidor nunca vê frase-senha, código de recuperação ou DEK.
export interface EnvelopeCifra {
  versao: number;
  kdfIteracoes: number;
  saltSenha: string;
  dekCifradaPorSenha: string;
  saltRecuperacao: string;
  dekCifradaPorRecuperacao: string;
}

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${obterTokenAtual()}`,
  };
}

/** `null` se a conta ainda não configurou criptografia; lança em qualquer outro erro. */
export async function buscarEnvelopeCifra(): Promise<EnvelopeCifra | null> {
  const resposta = await fetch(`${API_URL}/usuario/cifra`, { headers: headers() });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error('Não foi possível verificar a criptografia da conta.');
  return resposta.json();
}

export async function salvarEnvelopeCifra(envelope: EnvelopeCifra): Promise<void> {
  const resposta = await fetch(`${API_URL}/usuario/cifra`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(envelope),
  });
  if (!resposta.ok) throw new Error('Não foi possível salvar a configuração de criptografia.');
}
