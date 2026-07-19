import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from '../sync/config';
import { prepararSessaoParaUsuario } from '../sync/sync';
import { googleDisponivel, loginComGoogleNativo } from './googleSignIn';
import { definirTokenAtual } from './sessionToken';
import { lerSessao, limparSessao, salvarSessao } from './tokenStorage';

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
  logout: () => Promise<void>;
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

  useEffect(() => {
    lerSessao()
      .then((dados) => {
        if (dados) {
          const sessao: SessaoSalva = JSON.parse(dados);
          definirTokenAtual(sessao.token);
          setToken(sessao.token);
          setUsuario(sessao.usuario);
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  const salvar = useCallback(async (sessao: SessaoSalva) => {
    await salvarSessao(JSON.stringify(sessao));
    definirTokenAtual(sessao.token);
    // Sessao nova (login/cadastro) — pode ser outro usuario no mesmo
    // aparelho: se for, apaga os dados locais da conta anterior antes de
    // puxar os dados da conta atual (senão os itens ficam misturados).
    await prepararSessaoParaUsuario(sessao.usuario.id);
    setToken(sessao.token);
    setUsuario(sessao.usuario);
  }, []);

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

  const logout = useCallback(async () => {
    await limparSessao();
    definirTokenAtual(null);
    setToken(null);
    setUsuario(null);
  }, []);

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
        logout,
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
