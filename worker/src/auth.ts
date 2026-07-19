// Autenticacao do Worker usando so WebCrypto (disponivel nativamente no
// runtime dos Workers) -- sem bcrypt/jsonwebtoken, que dependem de APIs
// Node que nao existem nesse runtime.

const PBKDF2_ITERACOES = 100_000;

function paraHex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function deHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64UrlCodificar(dados: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : new Uint8Array(dados);
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodificar(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=');
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

// ---- Senhas (PBKDF2-SHA256) ----

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERACOES, hash: 'SHA-256' },
    chave,
    256,
  );
  return `${paraHex(salt)}:${paraHex(bits)}`;
}

export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  const [saltHex, hashHex] = hashArmazenado.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = deHex(saltHex);
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERACOES, hash: 'SHA-256' },
    chave,
    256,
  );
  return paraHex(bits) === hashHex;
}

// ---- JWT de sessao (HS256) ----

export interface SessaoPayload {
  sub: string; // usuario_id
  email: string;
  nome: string;
}

const JWT_VALIDADE_SEGUNDOS = 90 * 24 * 60 * 60; // 90 dias — app pessoal, sem refresh token por ora

async function chaveHmac(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function criarJwt(payload: SessaoPayload, segredo: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { ...payload, iat: agora, exp: agora + JWT_VALIDADE_SEGUNDOS };
  const cabecalhoCorpo = `${base64UrlCodificar(JSON.stringify(header))}.${base64UrlCodificar(JSON.stringify(corpo))}`;
  const chave = await chaveHmac(segredo);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(cabecalhoCorpo));
  return `${cabecalhoCorpo}.${base64UrlCodificar(assinatura)}`;
}

export async function verificarJwt(token: string, segredo: string): Promise<SessaoPayload | null> {
  const partes = token.split('.');
  if (partes.length !== 3) return null;
  const [cabecalhoB64, corpoB64, assinaturaB64] = partes;

  try {
    const chave = await chaveHmac(segredo);
    const valido = await crypto.subtle.verify(
      'HMAC',
      chave,
      base64UrlDecodificar(assinaturaB64),
      new TextEncoder().encode(`${cabecalhoB64}.${corpoB64}`),
    );
    if (!valido) return null;

    const corpo = JSON.parse(new TextDecoder().decode(base64UrlDecodificar(corpoB64)));
    if (typeof corpo.exp === 'number' && corpo.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: corpo.sub, email: corpo.email, nome: corpo.nome };
  } catch {
    return null;
  }
}

// ---- Validacao do id_token do Google (RS256 contra as chaves publicas do Google) ----

interface GoogleJwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg: string;
}

let cacheJwks: { chaves: GoogleJwk[]; expiraEm: number } | null = null;

async function buscarJwksGoogle(): Promise<GoogleJwk[]> {
  const agora = Date.now();
  if (cacheJwks && cacheJwks.expiraEm > agora) return cacheJwks.chaves;
  const resposta = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const dados = (await resposta.json()) as { keys: GoogleJwk[] };
  cacheJwks = { chaves: dados.keys, expiraEm: agora + 60 * 60 * 1000 };
  return dados.keys;
}

export interface GoogleIdTokenPayload {
  sub: string;
  email: string;
  name: string;
  aud: string;
  iss: string;
  exp: number;
}

/**
 * Verifica a assinatura RS256 do id_token do Google contra o JWKS publico
 * do Google e confere audiencia/emissor/validade. Retorna o payload
 * decodificado se tudo bater, ou null caso contrario (nunca lanca erro).
 */
export async function verificarGoogleIdToken(
  idToken: string,
  googleClientId: string,
): Promise<GoogleIdTokenPayload | null> {
  try {
    const partes = idToken.split('.');
    if (partes.length !== 3) return null;
    const [cabecalhoB64, corpoB64, assinaturaB64] = partes;

    const cabecalho = JSON.parse(new TextDecoder().decode(base64UrlDecodificar(cabecalhoB64)));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecodificar(corpoB64))) as GoogleIdTokenPayload;

    if (payload.aud !== googleClientId) return null;
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    const chaves = await buscarJwksGoogle();
    const jwk = chaves.find((k) => k.kid === cabecalho.kid);
    if (!jwk) return null;

    const chavePublica = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const valido = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      chavePublica,
      base64UrlDecodificar(assinaturaB64),
      new TextEncoder().encode(`${cabecalhoB64}.${corpoB64}`),
    );

    return valido ? payload : null;
  } catch {
    return null;
  }
}
