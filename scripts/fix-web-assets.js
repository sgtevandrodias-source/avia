// O Cloudflare Pages (via wrangler pages deploy) não sobe nenhum arquivo
// dentro de uma pasta chamada "node_modules" — provavelmente porque nosso
// .gitignore tem uma regra "node_modules/" não ancorada, que casa com essa
// pasta em qualquer profundidade, inclusive dentro de dist/assets. Resultado:
// toda fonte de ícone (Ionicons etc.) e imagem de pacotes como @expo e
// @react-navigation, que o `expo export --platform web` coloca em
// dist/assets/node_modules/..., nunca chegava no deploy — a requisição caía
// no fallback de SPA (index.html, content-type text/html) em vez do arquivo
// real. Esse script roda depois do `expo export --platform web`: renomeia
// essa pasta pra um nome que não bate com nenhuma regra de ignore (e tira o
// "@" das subpastas de pacotes com escopo, por segurança) e corrige as
// referências a esses caminhos dentro do bundle JS.
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ASSETS_DIR = path.join(DIST, 'assets');
const NODE_MODULES_DIR = path.join(ASSETS_DIR, 'node_modules');
const VENDOR_DIR = path.join(ASSETS_DIR, 'vendor');

function listarArquivos(dir) {
  const resultado = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) resultado.push(...listarArquivos(caminho));
    else resultado.push(caminho);
  }
  return resultado;
}

function main() {
  if (!fs.existsSync(NODE_MODULES_DIR)) {
    console.log('fix-web-assets: nenhuma pasta node_modules em dist/assets, nada a fazer.');
    return;
  }

  const substituicoes = [{ de: 'assets/node_modules/', para: 'assets/vendor/' }];
  fs.renameSync(NODE_MODULES_DIR, VENDOR_DIR);

  // Tira o "@" das subpastas de pacotes com escopo (ex.: @expo -> expo) —
  // não é a causa do bug, mas "@" em caminho de URL é incomum e mais seguro
  // de evitar.
  for (const entrada of fs.readdirSync(VENDOR_DIR, { withFileTypes: true })) {
    if (entrada.isDirectory() && entrada.name.startsWith('@')) {
      const nomeCorrigido = entrada.name.slice(1);
      fs.renameSync(path.join(VENDOR_DIR, entrada.name), path.join(VENDOR_DIR, nomeCorrigido));
      substituicoes.push({
        de: `vendor/${entrada.name}/`,
        para: `vendor/${nomeCorrigido}/`,
      });
    }
  }

  const arquivosJs = listarArquivos(path.join(DIST, '_expo')).filter((f) => f.endsWith('.js'));
  let arquivosAlterados = 0;
  for (const arquivo of arquivosJs) {
    let conteudo = fs.readFileSync(arquivo, 'utf8');
    let alterado = false;
    for (const { de, para } of substituicoes) {
      if (conteudo.includes(de)) {
        conteudo = conteudo.split(de).join(para);
        alterado = true;
      }
    }
    if (alterado) {
      fs.writeFileSync(arquivo, conteudo, 'utf8');
      arquivosAlterados += 1;
    }
  }

  console.log(
    `fix-web-assets: node_modules -> vendor, ${substituicoes.length - 1} pasta(s) com "@" corrigidas, referências ajustadas em ${arquivosAlterados} arquivo(s) JS.`,
  );
}

main();
