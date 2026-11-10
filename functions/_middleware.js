// Cloudflare Pages Function (roda antes de toda requisição do site web).
// O projeto "avia" no Pages responde em dois endereços: o domínio próprio
// edsavia.com.br e o padrão avia-8qu.pages.dev. Só o primeiro deve ser
// usado, então o endereço antigo redireciona pra ele mantendo caminho e
// query (ex.: /privacidade). Só o host exato: os previews por branch
// (ex.: master.avia-8qu.pages.dev) continuam acessíveis pra testes.
// Fica na raiz do projeto (não em dist/) porque o `wrangler pages deploy`
// procura a pasta functions/ no diretório de onde é chamado.
const HOST_ANTIGO = 'avia-8qu.pages.dev';
const HOST_OFICIAL = 'edsavia.com.br';

// Cabeçalhos de segurança. Ficam aqui (e não num arquivo _headers) porque a
// Cloudflare não aplica o _headers em sites que têm Pages Functions.
//
// A Content-Security-Policy diz ao navegador de onde o site pode carregar
// coisas. É a principal defesa contra script malicioso injetado (XSS) —
// importante porque a versão web guarda a sessão e a chave de
// criptografia no navegador. O que cada linha libera:
// - script-src 'self': só os scripts do próprio site (nenhum embutido no
//   HTML — por isso o registro do service worker virou /registrar-sw.js).
// - style-src 'unsafe-inline': o react-native-web cria estilos na hora.
// - fonts.googleapis.com / fonts.gstatic.com: fonte Inter (ver
//   src/theme/typography.web.ts).
// - img-src https:: fotos de perfil do Google.
// - connect-src: a API do Avia (src/sync/config.ts). Se o endereço da API
//   mudar, precisa mudar aqui também, senão a versão web para de sincronizar.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://avia-api.sgtevandrodias.workers.dev https://fonts.googleapis.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const CABECALHOS_SEGURANCA = {
  'Content-Security-Policy': CSP,
  // Força HTTPS por 1 ano. Sem includeSubDomains de propósito: não trava
  // nenhum subdomínio que um dia precise de outra configuração.
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Microfone liberado só pro próprio site (ditado por voz); o resto, nunca.
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=(), payment=(), usb=()',
};

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === HOST_ANTIGO) {
    url.hostname = HOST_OFICIAL;
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }

  const resposta = await next();
  // A resposta vinda de next() pode ter cabeçalhos imutáveis — copia antes.
  const comCabecalhos = new Response(resposta.body, resposta);
  for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) {
    comCabecalhos.headers.set(nome, valor);
  }
  return comCabecalhos;
}
