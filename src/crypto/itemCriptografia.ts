import type { Item } from '../types/item';
import { obterChaveAtual } from './chaveAtual';
import { cifrarTexto, decifrarTexto, estaCifrado } from './wireFormat';

// Ponto único onde a cifra entra no fluxo de sincronização — usado tanto por
// src/sync/sync.ts (push/pull nativo) quanto por src/db/database.web.ts
// (cada chamada de API no web). Sem DEK em cache, as duas funções abaixo são
// passagem direta — é assim que o app continua funcionando pra quem nunca
// configura criptografia (opcional/pulável, ver PROMPT/plano).
const CAMPOS_CIFRAVEIS = ['titulo', 'textoOriginal', 'notas'] as const;
type CampoCifravel = (typeof CAMPOS_CIFRAVEIS)[number];

function copiarComCampo<T extends Item>(item: T, campo: CampoCifravel, valor: string | null): T {
  return { ...item, [campo]: valor };
}

/** Cifra titulo/textoOriginal/notas antes de mandar pro servidor. Não cifra de novo o que já é cifrado (reenvio). */
export function cifrarItemParaEnvio<T extends Item>(item: T): T {
  const chave = obterChaveAtual();
  if (!chave) return item;

  let resultado = item;
  for (const campo of CAMPOS_CIFRAVEIS) {
    const valor = resultado[campo];
    if (valor != null && !estaCifrado(valor)) {
      resultado = copiarComCampo(resultado, campo, cifrarTexto(valor, chave));
    }
  }
  return resultado;
}

/**
 * Decifra titulo/textoOriginal/notas recebidos do servidor. Sem DEK em cache
 * (aparelho bloqueado), devolve o item como veio — ainda cifrado — pra quem
 * exibe usar `campoOuBloqueado`. Se a decifra falhar por algum motivo (dado
 * corrompido), mantém o valor cifrado em vez de derrubar a sincronização.
 */
export function decifrarItemRecebido<T extends Item>(item: T): T {
  const chave = obterChaveAtual();
  if (!chave) return item;

  let resultado = item;
  for (const campo of CAMPOS_CIFRAVEIS) {
    const valor = resultado[campo];
    if (valor != null && estaCifrado(valor)) {
      try {
        resultado = copiarComCampo(resultado, campo, decifrarTexto(valor, chave));
      } catch {
        // mantém cifrado — não interrompe a sincronização por um item só.
      }
    }
  }
  return resultado;
}

const PLACEHOLDER_BLOQUEADO = '🔒 Conteúdo bloqueado';

/** Uso só de exibição (UI/notificações) — nunca persiste esse placeholder. */
export function campoOuBloqueado(valor: string | null): string | null {
  if (valor == null) return valor;
  return estaCifrado(valor) ? PLACEHOLDER_BLOQUEADO : valor;
}

/**
 * `true` quando titulo/notas ainda estão cifrados neste ponto do app — ou
 * seja, passaram por `decifrarItemRecebido` sem uma DEK disponível (aparelho
 * bloqueado). Usado pra desabilitar a edição desses dois campos: sem isso,
 * salvar o item de volta mandaria o texto novo em texto puro pro servidor
 * (sem DEK não tem como cifrar) mesmo a conta tendo criptografia configurada.
 */
export function tituloOuNotasBloqueados(item: Item): boolean {
  return estaCifrado(item.titulo) || estaCifrado(item.notas);
}
