// Backup do Avia: banco D1 de produção + arquivos antigos no R2, num pacote
// único CIFRADO, guardado no computador e no Google Drive. Ver LEIAME.md.
//
//   node scripts/backup/backup.mjs --criar-senha   (uma vez: cria a senha)
//   node scripts/backup/backup.mjs                 (faz o backup)
//
// Só LÊ a produção (nunca altera nada lá). O conteúdo sem cifra existe só
// numa pasta temporária, apagada no fim mesmo se algo der errado. Cópias com
// mais de 30 dias são apagadas — é o prazo prometido na política de
// privacidade —, mas só depois de um backup novo dar certo, pra nunca ficar
// sem nenhum.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cifrar, decifrar } from './cifra.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PASTA_WORKER = path.join(RAIZ, 'worker');
const BANCO = 'avia-db';
const BUCKET = 'avia-arquivo';
const DIAS_DE_RETENCAO = 30;
// Só pra testar o script sem tocar na produção: AVIA_BACKUP_MODO=local lê o
// banco local do wrangler dev.
const ALVO = process.env.AVIA_BACKUP_MODO === 'local' ? '--local' : '--remote';

// Fora do projeto (o repositório é público): senha e backups nunca entram no Git.
const ARQUIVO_SENHA =
  process.env.AVIA_BACKUP_SENHA ?? path.join(os.homedir(), 'Documents', 'chaves-avia', 'senha-backup.txt');
const PASTA_LOCAL = process.env.AVIA_BACKUP_LOCAL ?? path.join(os.homedir(), 'Documents', 'avia-backups');
const PASTA_NUVEM = process.env.AVIA_BACKUP_NUVEM ?? 'G:\\Meu Drive\\Avia-backups';
const LOG = path.join(PASTA_LOCAL, 'backup.log');
const PADRAO_NOME = /^avia-backup-(\d{4}-\d{2}-\d{2})_\d{4}\.aviabkp$/;

function registrar(linha) {
  const texto = `${new Date().toISOString()} ${linha}`;
  console.log(texto);
  fs.mkdirSync(PASTA_LOCAL, { recursive: true });
  fs.appendFileSync(LOG, texto + '\n');
}

function aspas(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** Roda o wrangler da pasta worker/ (usa o login da Cloudflare já feito neste computador). */
function wrangler(args) {
  const r = spawnSync(['npx', 'wrangler', ...args].map(aspas).join(' '), {
    cwd: PASTA_WORKER,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    const fim = `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(-5).join(' | ');
    throw new Error(`wrangler ${args.slice(0, 2).join(' ')} falhou (código ${r.status}): ${fim}`);
  }
  return r.stdout;
}

function lerSenha() {
  if (!fs.existsSync(ARQUIVO_SENHA)) {
    throw new Error(`Senha do backup não encontrada em ${ARQUIVO_SENHA}. Rode antes: node scripts/backup/backup.mjs --criar-senha`);
  }
  const senha = fs.readFileSync(ARQUIVO_SENHA, 'utf8').trim();
  if (senha.length < 16) throw new Error('A senha do backup é curta demais (mínimo 16 caracteres).');
  return senha;
}

function criarSenha() {
  if (fs.existsSync(ARQUIVO_SENHA)) {
    console.log(`Já existe uma senha em ${ARQUIVO_SENHA}. Nada foi alterado.`);
    return;
  }
  const senha = randomBytes(24).toString('base64url');
  fs.mkdirSync(path.dirname(ARQUIVO_SENHA), { recursive: true });
  fs.writeFileSync(ARQUIVO_SENHA, senha + '\n');
  console.log('Senha do backup criada e salva em:');
  console.log(`  ${ARQUIVO_SENHA}\n`);
  console.log(`  SENHA: ${senha}\n`);
  console.log('IMPORTANTE: guarde essa senha TAMBÉM fora deste computador (gerenciador de senhas ou papel).');
  console.log('Sem ela, os backups do Google Drive não abrem — se o computador quebrar, ela some junto.');
}

function apagarAntigos(pasta) {
  if (!fs.existsSync(pasta)) return 0;
  const limite = Date.now() - DIAS_DE_RETENCAO * 24 * 60 * 60 * 1000;
  let apagados = 0;
  for (const nome of fs.readdirSync(pasta)) {
    const m = nome.match(PADRAO_NOME);
    if (m && new Date(`${m[1]}T00:00:00Z`).getTime() < limite) {
      fs.unlinkSync(path.join(pasta, nome));
      apagados++;
    }
  }
  return apagados;
}

function avisarBackupsSemCifra() {
  const limite = Date.now() - DIAS_DE_RETENCAO * 24 * 60 * 60 * 1000;
  for (const nome of fs.readdirSync(PASTA_WORKER)) {
    if (/^backup-.*\.sql$/.test(nome) && fs.statSync(path.join(PASTA_WORKER, nome)).mtimeMs < limite) {
      registrar(`AVISO: worker/${nome} é um backup SEM cifra com mais de ${DIAS_DE_RETENCAO} dias — apague-o.`);
    }
  }
}

function fazerBackup() {
  const senha = lerSenha();
  const agora = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const carimbo = `${agora.getFullYear()}-${p2(agora.getMonth() + 1)}-${p2(agora.getDate())}_${p2(agora.getHours())}${p2(agora.getMinutes())}`;
  const nomeFinal = `avia-backup-${carimbo}.aviabkp`;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'avia-backup-'));

  try {
    // 1. Banco de dados inteiro (só leitura).
    const arquivoSql = path.join(temp, 'banco.sql');
    wrangler(['d1', 'export', BANCO, ALVO, '--output', arquivoSql, '--skip-confirmation']);
    if (!fs.existsSync(arquivoSql) || fs.statSync(arquivoSql).size < 1000) {
      throw new Error('A exportação do banco veio vazia.');
    }

    // 2. Arquivos antigos no R2 (tarefas concluídas há mais de 6 meses).
    const saida = wrangler(['d1', 'execute', BANCO, ALVO, '--json', '--command', 'SELECT r2_key FROM arquivos']);
    const chaves = JSON.parse(saida.slice(saida.indexOf('[')))[0].results.map((l) => l.r2_key);
    const pastaR2 = path.join(temp, 'r2');
    fs.mkdirSync(pastaR2);
    for (const chave of chaves) {
      if (!/^[\w\-/.]+$/.test(chave)) throw new Error('Chave inesperada no R2 — backup interrompido por segurança.');
      wrangler(['r2', 'object', 'get', `${BUCKET}/${chave}`, ALVO, '--file', path.join(pastaR2, chave.replace(/\//g, '__'))]);
    }

    fs.writeFileSync(
      path.join(temp, 'manifesto.json'),
      JSON.stringify({ criadoEm: agora.toISOString(), banco: BANCO, arquivosR2: chaves.length }, null, 2),
    );

    // 3. Empacota, cifra e confere se a cópia cifrada abre de volta igual.
    const pacote = path.join(os.tmpdir(), `avia-pacote-${carimbo}-${randomBytes(4).toString('hex')}.tar.gz`);
    try {
      const tar = spawnSync('C:\\Windows\\System32\\tar.exe', ['-czf', pacote, '-C', temp, '.'], { encoding: 'utf8' });
      if (tar.status !== 0) throw new Error(`Falha ao empacotar: ${tar.stderr}`);
      const dados = fs.readFileSync(pacote);
      const cifrado = cifrar(dados, senha);
      const hash = (b) => createHash('sha256').update(b).digest('hex');
      if (hash(decifrar(cifrado, senha)) !== hash(dados)) throw new Error('A conferência da cópia cifrada falhou.');

      // 4. Grava no computador e na nuvem.
      fs.mkdirSync(PASTA_LOCAL, { recursive: true });
      fs.writeFileSync(path.join(PASTA_LOCAL, nomeFinal), cifrado);
      let naNuvem = false;
      if (fs.existsSync(path.dirname(PASTA_NUVEM))) {
        fs.mkdirSync(PASTA_NUVEM, { recursive: true });
        fs.writeFileSync(path.join(PASTA_NUVEM, nomeFinal), cifrado);
        naNuvem = true;
      } else {
        registrar(`AVISO: ${path.dirname(PASTA_NUVEM)} não encontrado (Google Drive fechado?) — cópia só no computador.`);
      }

      // 5. Só agora, com um backup novo garantido, apaga os antigos.
      const apagados = apagarAntigos(PASTA_LOCAL) + (naNuvem ? apagarAntigos(PASTA_NUVEM) : 0);
      registrar(
        `OK ${nomeFinal} — ${(cifrado.length / 1024).toFixed(0)} KB, ${chaves.length} arquivo(s) do R2, ` +
          `${naNuvem ? 'computador + Google Drive' : 'só computador'}, ${apagados} cópia(s) antiga(s) apagada(s)`,
      );
    } finally {
      fs.rmSync(pacote, { force: true });
    }
  } finally {
    // O conteúdo sem cifra nunca fica no disco.
    fs.rmSync(temp, { recursive: true, force: true });
  }
  avisarBackupsSemCifra();
}

try {
  if (process.argv.includes('--criar-senha')) criarSenha();
  else fazerBackup();
} catch (erro) {
  registrar(`ERRO ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}
