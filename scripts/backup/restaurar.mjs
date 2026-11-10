// Abre (decifra e extrai) um backup do Avia numa pasta. NÃO mexe na
// produção — só deixa os arquivos prontos pra conferir ou restaurar.
//
//   node scripts/backup/restaurar.mjs <arquivo.aviabkp> <pasta-de-destino>
//
// A senha vem do mesmo arquivo usado no backup (ver backup.mjs). Num
// computador novo, sem esse arquivo, ela é pedida aqui no terminal.
// ATENÇÃO: a pasta de destino fica com os dados de TODOS os usuários sem
// cifra — apague-a assim que terminar.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { decifrar } from './cifra.mjs';

const ARQUIVO_SENHA =
  process.env.AVIA_BACKUP_SENHA ?? path.join(os.homedir(), 'Documents', 'chaves-avia', 'senha-backup.txt');

const [arquivo, destino] = process.argv.slice(2);
if (!arquivo || !destino) {
  console.log('Uso: node scripts/backup/restaurar.mjs <arquivo.aviabkp> <pasta-de-destino>');
  process.exit(1);
}
if (fs.existsSync(destino) && fs.readdirSync(destino).length > 0) {
  console.log(`A pasta ${destino} já tem arquivos. Use uma pasta nova e vazia.`);
  process.exit(1);
}

let senha;
if (fs.existsSync(ARQUIVO_SENHA)) {
  senha = fs.readFileSync(ARQUIVO_SENHA, 'utf8').trim();
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  senha = (await rl.question('Senha do backup: ')).trim();
  rl.close();
}

try {
  const dados = decifrar(fs.readFileSync(arquivo), senha);
  fs.mkdirSync(destino, { recursive: true });
  const pacote = path.join(destino, 'pacote.tar.gz');
  fs.writeFileSync(pacote, dados);
  const tar = spawnSync('C:\\Windows\\System32\\tar.exe', ['-xzf', pacote, '-C', destino], { encoding: 'utf8' });
  fs.rmSync(pacote, { force: true });
  if (tar.status !== 0) throw new Error(`Falha ao extrair: ${tar.stderr}`);
  const manifesto = JSON.parse(fs.readFileSync(path.join(destino, 'manifesto.json'), 'utf8'));
  console.log(`Backup de ${manifesto.criadoEm} aberto em ${destino}:`);
  console.log('  banco.sql  — o banco inteiro (ver PLANO_DE_INCIDENTES.md para restaurar)');
  console.log(`  r2/        — ${manifesto.arquivosR2} arquivo(s) de tarefas antigas`);
  console.log('\nLembre de APAGAR essa pasta quando terminar: os dados estão sem cifra.');
} catch (erro) {
  console.log(`Não foi possível abrir: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
}
