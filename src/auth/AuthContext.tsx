import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from '../sync/config';
import {
  alternarSessaoParaUsuario,
  prepararSessaoParaUsuario,
  redecifrarCacheLocalAposDesbloqueio,
} from '../sync/sync';
import * as db from '../db/database';
import { buscarEnvelopeCifra, salvarEnvelopeCifra, type EnvelopeCifra } from '../crypto/apiCifra';
import { definirChaveAtual } from '../crypto/chaveAtual';
import { lerChaveLocal, limparChaveLocal, salvarChaveLocal } from '../crypto/chaveCriptografia';
import { embrulharDek, gerarDek, ITERACOES_PBKDF2, desembrulharDek } from '../crypto/dek';
import { gerarCodigoRecuperacao, normalizarCodigoRecuperacao } from '../crypto/codigoRecuperacao';
import { googleDisponivel, loginComGoogleNativo } from './googleSignIn';
import { definirTokenAtual, obterTokenAtual } from './sessionToken';
import { lerSessao, limparSessao, salvarSessao } from './tokenStorage';
import { registrarTokenPush } from '../notifications/pushToken';

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  fotoUrl?: string | null;
}

interface SessaoSalva {
  token: string;
  usuario: Usuario;
}

// Todas as contas já logadas neste aparelho, guardadas juntas sob a mesma
// chave de armazenamento (avia_sessao) — `ativoId` diz qual delas está em
// uso agora. Quem já usava o app antes desta versão tinha o formato antigo
// (uma SessaoSalva direta, sem lista); normalizarContasSalvas migra isso em
// memória na primeira leitura, sem exigir logar de novo.
interface ContasSalvas {
  contas: SessaoSalva[];
  ativoId: string | null;
}

interface AuthContextValue {
  usuario: Usuario | null;
  token: string | null;
  contas: Usuario[];
  carregando: boolean;
  erro: string | null;
  googleDisponivel: boolean;
  registrar: (email: string, senha: string, nome: string) => Promise<void>;
  login: (email: string, senha: string) => Promise<void>;
  loginComGoogle: () => Promise<void>;
  definirSenha: (senha: string) => Promise<void>;
  logout: () => Promise<void>;
  alternarConta: (usuarioId: string) => Promise<void>;
  removerConta: (usuarioId: string) => Promise<void>;
  excluirConta: () => Promise<void>;
  // Criptografia ponta a ponta (opcional) — ver src/crypto/.
  // `null` = ainda não verificou (logo após abrir o app/logar).
  criptografiaConfigurada: boolean | null;
  criptografiaBloqueada: boolean;
  configurarCriptografia: (fraseSenha: string) => Promise<string>;
  desbloquearCriptografia: (segredo: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function chamarAuth(caminho: string, corpo: unknown): Promise<SessaoSalva> {
  const resposta = await fetch(`${API_URL}/auth/${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json();
  if (!resposta.ok) {
    throw new Error(dados?.erro ?? 'Não foi possível completar a operação.');
  }
  return dados as SessaoSalva;
}

function normalizarContasSalvas(bruto: unknown): ContasSalvas {
  if (bruto && typeof bruto === 'object' && Array.isArray((bruto as { contas?: unknown }).contas)) {
    const tipado = bruto as ContasSalvas;
    return { contas: tipado.contas, ativoId: tipado.ativoId ?? null };
  }
  // Formato antigo (versões anteriores à alternância de contas): uma sessão
  // única salva direto, sem envelope de lista.
  const antiga = bruto as SessaoSalva | null;
  if (antiga && antiga.token && antiga.usuario) {
    return { contas: [antiga], ativoId: antiga.usuario.id };
  }
  return { contas: [], ativoId: null };
}

async function lerContasSalvas(): Promise<ContasSalvas> {
  const dados = await lerSessao();
  if (!dados) return { contas: [], ativoId: null };
  try {
    return normalizarContasSalvas(JSON.parse(dados));
  } catch {
    return { contas: [], ativoId: null };
  }
}

async function salvarContasSalvas(estado: ContasSalvas): Promise<void> {
  await salvarSessao(JSON.stringify(estado));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [contas, setContas] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [criptografiaBloqueada, setCriptografiaBloqueada] = useState(false);
  const [criptografiaConfigurada, setCriptografiaConfigurada] = useState<boolean | null>(null);

  // Depois de restaurar sessão OU logar: se a conta tem criptografia
  // configurada no servidor mas este aparelho não tem a DEK em cache, marca
  // como bloqueada (a UI degrada — ver campoOuBloqueado/tituloOuNotasBloqueados
  // — em vez de travar o app inteiro).
  const verificarCriptografia = useCallback(async (usuarioId: string) => {
    try {
      const envelope = await buscarEnvelopeCifra();
      if (!envelope) {
        definirChaveAtual(null);
        setCriptografiaBloqueada(false);
        setCriptografiaConfigurada(false);
        return;
      }
      setCriptografiaConfigurada(true);
      const chaveEmCache = await lerChaveLocal(usuarioId);
      if (chaveEmCache) {
        definirChaveAtual(chaveEmCache);
        setCriptografiaBloqueada(false);
      } else {
        definirChaveAtual(null);
        setCriptografiaBloqueada(true);
      }
    } catch {
      // Sem rede/erro no servidor: não trava nada, só não sabemos ainda —
      // próxima sincronização/reabertura tenta de novo.
    }
  }, []);

  useEffect(() => {
    lerContasSalvas()
      .then(async (estado) => {
        setContas(estado.contas.map((c) => c.usuario));
        const ativa = estado.contas.find((c) => c.usuario.id === estado.ativoId);
        if (ativa) {
          definirTokenAtual(ativa.token);
          // Precisa apontar pro arquivo SQLite certo ANTES de setUsuario —
          // é só depois que usuario deixa de ser null que o resto da árvore
          // (Categorias/Compartilhamentos/Items providers) monta e começa a
          // ler o banco local (ver App.tsx Conteudo()).
          db.definirUsuarioAtivo(ativa.usuario.id);
          setToken(ativa.token);
          setUsuario(ativa.usuario);
          await verificarCriptografia(ativa.usuario.id);
          registrarTokenPush();
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [verificarCriptografia]);

  const salvar = useCallback(
    async (sessao: SessaoSalva) => {
      // Login novo (tela de login OU "Adicionar conta") — insere ou
      // atualiza essa conta na lista salva neste aparelho e marca como
      // ativa. É o mesmo caminho pro primeiro login e pra "adicionar outra
      // conta"; a única diferença é de qual tela isso foi chamado.
      const estadoAtual = await lerContasSalvas();
      const outras = estadoAtual.contas.filter((c) => c.usuario.id !== sessao.usuario.id);
      const novoEstado: ContasSalvas = { contas: [...outras, sessao], ativoId: sessao.usuario.id };
      await salvarContasSalvas(novoEstado);
      setContas(novoEstado.contas.map((c) => c.usuario));

      definirTokenAtual(sessao.token);
      // Cada conta tem seu próprio arquivo SQLite local (ver
      // definirUsuarioAtivo em database.ts) — prepararSessaoParaUsuario só
      // troca pra ele e força uma sincronização completa, sem risco de
      // misturar dados de contas diferentes.
      await prepararSessaoParaUsuario(sessao.usuario.id);
      setToken(sessao.token);
      setUsuario(sessao.usuario);
      await verificarCriptografia(sessao.usuario.id);
      registrarTokenPush();
    },
    [verificarCriptografia],
  );

  /** Troca pra outra conta JÁ salva neste aparelho — ver ContasScreen. */
  const alternarConta = useCallback(
    async (usuarioId: string) => {
      const estado = await lerContasSalvas();
      const alvo = estado.contas.find((c) => c.usuario.id === usuarioId);
      if (!alvo || alvo.usuario.id === usuario?.id) return;
      await salvarContasSalvas({ ...estado, ativoId: usuarioId });

      definirTokenAtual(alvo.token);
      await alternarSessaoParaUsuario(alvo.usuario.id);
      setToken(alvo.token);
      setUsuario(alvo.usuario);
      await verificarCriptografia(alvo.usuario.id);
      registrarTokenPush();
    },
    [usuario, verificarCriptografia],
  );

  /**
   * Esquece uma conta deste aparelho (remove da lista salva e apaga o
   * cache local dela). Se era a conta ativa, alterna pra outra salva
   * restante ou, se não sobrar nenhuma, volta pra tela de login — mesmo
   * efeito do "Sair" de antes, quando só existia uma conta possível.
   */
  const removerConta = useCallback(
    async (usuarioId: string) => {
      const eraAtiva = usuario?.id === usuarioId;
      const estado = await lerContasSalvas();
      const restantes = estado.contas.filter((c) => c.usuario.id !== usuarioId);

      if (eraAtiva) {
        await limparChaveLocal(usuarioId);
        definirChaveAtual(null);
        setCriptografiaBloqueada(false);
        setCriptografiaConfigurada(null);
      }
      await db.apagarBancoDaConta(usuarioId);

      if (restantes.length === 0) {
        await limparSessao();
        setContas([]);
        if (eraAtiva) {
          definirTokenAtual(null);
          setToken(null);
          setUsuario(null);
        }
        return;
      }

      const novoAtivoId = eraAtiva ? restantes[0].usuario.id : estado.ativoId;
      await salvarContasSalvas({ contas: restantes, ativoId: novoAtivoId });
      setContas(restantes.map((c) => c.usuario));

      if (eraAtiva) {
        const novaAtiva = restantes[0];
        definirTokenAtual(novaAtiva.token);
        await alternarSessaoParaUsuario(novaAtiva.usuario.id);
        setToken(novaAtiva.token);
        setUsuario(novaAtiva.usuario);
        await verificarCriptografia(novaAtiva.usuario.id);
        registrarTokenPush();
      }
    },
    [usuario, verificarCriptografia],
  );

  const registrar = useCallback(
    async (email: string, senha: string, nome: string) => {
      setErro(null);
      try {
        const sessao = await chamarAuth('registrar', { email, senha, nome });
        await salvar(sessao);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao criar conta.');
        throw e;
      }
    },
    [salvar],
  );

  const login = useCallback(
    async (email: string, senha: string) => {
      setErro(null);
      try {
        const sessao = await chamarAuth('login', { email, senha });
        await salvar(sessao);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao entrar.');
        throw e;
      }
    },
    [salvar],
  );

  const loginComGoogle = useCallback(async () => {
    setErro(null);
    try {
      const idToken = await loginComGoogleNativo();
      if (!idToken) return; // usuário cancelou
      const sessao = await chamarAuth('google', { idToken });
      await salvar(sessao);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao entrar com Google.');
      throw e;
    }
  }, [salvar]);

  const definirSenha = useCallback(async (senha: string) => {
    setErro(null);
    const resposta = await fetch(`${API_URL}/usuario/senha`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${obterTokenAtual()}`,
      },
      body: JSON.stringify({ senha }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) {
      const mensagem = dados?.erro ?? 'Não foi possível definir a senha.';
      setErro(mensagem);
      throw new Error(mensagem);
    }
  }, []);

  /**
   * Apaga a conta DE VERDADE — servidor primeiro (item por item, categorias,
   * compartilhamentos, criptografia, tudo, ver excluirContaCompleta no
   * Worker), e só depois de confirmado o sucesso é que limpa este aparelho
   * (removerConta). Nessa ordem: se a chamada ao servidor falhar (rede,
   * etc.), nada muda localmente e o usuário pode tentar de novo — nunca gera
   * um estado "esqueci localmente mas os dados continuam vivos no servidor".
   */
  const excluirConta = useCallback(async () => {
    if (!usuario) throw new Error('Sem sessão ativa.');
    const resposta = await fetch(`${API_URL}/usuario`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${obterTokenAtual()}` },
    });
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => null);
      throw new Error(dados?.erro ?? 'Não foi possível excluir a conta.');
    }
    await removerConta(usuario.id);
  }, [usuario, removerConta]);

  // "Sair" continua removendo só a conta ativa deste aparelho — se houver
  // outras contas salvas, o app alterna pra uma delas em vez de voltar pra
  // tela de login (ver removerConta acima).
  const logout = useCallback(async () => {
    if (usuario) await removerConta(usuario.id);
  }, [usuario, removerConta]);

  /** Gera a DEK, embrulha com a frase-senha e com um novo código de recuperação, salva no servidor e no aparelho. Retorna o código de recuperação (mostrar UMA vez). */
  const configurarCriptografia = useCallback(
    async (fraseSenha: string) => {
      if (!usuario) throw new Error('Sem sessão ativa.');
      const dek = gerarDek();
      const codigoRecuperacao = gerarCodigoRecuperacao();

      const embrulhadaSenha = embrulharDek(dek, fraseSenha);
      const embrulhadaRecuperacao = embrulharDek(dek, normalizarCodigoRecuperacao(codigoRecuperacao));

      const envelope: EnvelopeCifra = {
        versao: 1,
        kdfIteracoes: ITERACOES_PBKDF2,
        saltSenha: embrulhadaSenha.saltB64,
        dekCifradaPorSenha: embrulhadaSenha.dekCifradaB64,
        saltRecuperacao: embrulhadaRecuperacao.saltB64,
        dekCifradaPorRecuperacao: embrulhadaRecuperacao.dekCifradaB64,
      };
      await salvarEnvelopeCifra(envelope);
      await salvarChaveLocal(usuario.id, dek);
      definirChaveAtual(dek);
      setCriptografiaBloqueada(false);
      setCriptografiaConfigurada(true);
      return codigoRecuperacao;
    },
    [usuario],
  );

  /** Tenta `segredo` como frase-senha e, se não bater, como código de recuperação. */
  const desbloquearCriptografia = useCallback(
    async (segredo: string) => {
      if (!usuario) return false;
      const envelope = await buscarEnvelopeCifra();
      if (!envelope) return false;

      // Não sabemos de antemão se o usuário digitou a frase-senha ou o código
      // de recuperação — tenta contra o envelope da senha primeiro e, se a
      // tag de autenticação não bater (segredo errado pra esse envelope),
      // tenta contra o envelope da recuperação.
      let dek = desembrulharDek(
        { saltB64: envelope.saltSenha, dekCifradaB64: envelope.dekCifradaPorSenha },
        segredo,
        envelope.kdfIteracoes,
      );
      if (!dek) {
        dek = desembrulharDek(
          { saltB64: envelope.saltRecuperacao, dekCifradaB64: envelope.dekCifradaPorRecuperacao },
          normalizarCodigoRecuperacao(segredo),
          envelope.kdfIteracoes,
        );
      }
      if (!dek) return false;

      await salvarChaveLocal(usuario.id, dek);
      definirChaveAtual(dek);
      setCriptografiaBloqueada(false);
      await redecifrarCacheLocalAposDesbloqueio();
      return true;
    },
    [usuario],
  );

  return (
    <AuthContext.Provider
      value={{
        usuario,
        token,
        contas,
        carregando,
        erro,
        googleDisponivel: googleDisponivel(),
        registrar,
        login,
        loginComGoogle,
        definirSenha,
        logout,
        alternarConta,
        removerConta,
        excluirConta,
        criptografiaConfigurada,
        criptografiaBloqueada,
        configurarCriptografia,
        desbloquearCriptografia,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
