import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from '../sync/config';
import { prepararSessaoParaUsuario, redecifrarCacheLocalAposDesbloqueio } from '../sync/sync';
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
}

interface SessaoSalva {
  token: string;
  usuario: Usuario;
}

interface AuthContextValue {
  usuario: Usuario | null;
  token: string | null;
  carregando: boolean;
  erro: string | null;
  googleDisponivel: boolean;
  registrar: (email: string, senha: string, nome: string) => Promise<void>;
  login: (email: string, senha: string) => Promise<void>;
  loginComGoogle: () => Promise<void>;
  definirSenha: (senha: string) => Promise<void>;
  logout: () => Promise<void>;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
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
    lerSessao()
      .then(async (dados) => {
        if (dados) {
          const sessao: SessaoSalva = JSON.parse(dados);
          definirTokenAtual(sessao.token);
          setToken(sessao.token);
          setUsuario(sessao.usuario);
          await verificarCriptografia(sessao.usuario.id);
          registrarTokenPush();
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [verificarCriptografia]);

  const salvar = useCallback(
    async (sessao: SessaoSalva) => {
      await salvarSessao(JSON.stringify(sessao));
      definirTokenAtual(sessao.token);
      // Sessao nova (login/cadastro) — pode ser outro usuario no mesmo
      // aparelho: se for, apaga os dados locais da conta anterior antes de
      // puxar os dados da conta atual (senão os itens ficam misturados).
      await prepararSessaoParaUsuario(sessao.usuario.id);
      setToken(sessao.token);
      setUsuario(sessao.usuario);
      await verificarCriptografia(sessao.usuario.id);
      registrarTokenPush();
    },
    [verificarCriptografia],
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

  const logout = useCallback(async () => {
    if (usuario) await limparChaveLocal(usuario.id);
    definirChaveAtual(null);
    setCriptografiaBloqueada(false);
    setCriptografiaConfigurada(null);
    await limparSessao();
    definirTokenAtual(null);
    setToken(null);
    setUsuario(null);
  }, [usuario]);

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
        carregando,
        erro,
        googleDisponivel: googleDisponivel(),
        registrar,
        login,
        loginComGoogle,
        definirSenha,
        logout,
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
