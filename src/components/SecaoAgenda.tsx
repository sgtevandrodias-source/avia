import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import {
  agendaDisponivel,
  ativarAgenda,
  desligarAgenda,
  enviarTarefasExistentes,
  lerAvisoAgenda,
  lerConfigAgenda,
  limparAvisoAgenda,
  listarCalendariosGoogle,
  pedirPermissaoAgenda,
  removerEventosDaAgenda,
  sincronizarAgenda,
} from '../agenda/agenda';
import { CONFIG_AGENDA_PADRAO, type CalendarioGoogle, type ConfigAgenda } from '../agenda/tipos';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar, confirmar } from '../utils/confirm';

/** Seção "Google Agenda" da tela de Configurações. */
export function SecaoAgenda() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { usuario, criptografiaConfigurada, criptografiaBloqueada } = useAuth();
  const [config, setConfig] = useState<ConfigAgenda>(CONFIG_AGENDA_PADRAO);
  const [aviso, setAviso] = useState<string | null>(null);
  const [calendarios, setCalendarios] = useState<CalendarioGoogle[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const disponivel = agendaDisponivel();

  const recarregar = useCallback(async () => {
    const [novaConfig, novoAviso] = await Promise.all([lerConfigAgenda(), lerAvisoAgenda()]);
    setConfig(novaConfig);
    setAviso(novoAviso);
  }, []);

  useEffect(() => {
    if (disponivel) recarregar().catch(() => {});
    // usuario?.id: cada conta do aparelho tem a própria configuração.
  }, [disponivel, recarregar, usuario?.id]);

  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      avisar('Google Agenda', e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.');
    } finally {
      await recarregar().catch(() => {});
      setOcupado(false);
    }
  };

  const abrirListaDeCalendarios = () =>
    executar(async () => {
      const permissao = await pedirPermissaoAgenda();
      if (!permissao.concedida) {
        if (permissao.podePedirDeNovo) {
          avisar('Permissão necessária', 'Sem acesso ao calendário, o Avia não consegue criar os eventos.');
        } else {
          confirmar(
            'Permissão necessária',
            'O acesso ao calendário foi negado. Quer abrir as configurações do aparelho para permitir?',
            () => {
              Linking.openSettings().catch(() => {});
            },
          );
        }
        return;
      }
      setCalendarios(await listarCalendariosGoogle());
    });

  const pedirCalendario = () => {
    if (criptografiaConfigurada && !config.aceitouCripto) {
      confirmar(
        'Criptografia ativa',
        'O título e as notas das tarefas serão enviados ao Google sem criptografia. Deseja continuar?',
        abrirListaDeCalendarios,
      );
      return;
    }
    abrirListaDeCalendarios();
  };

  const alternar = (ligar: boolean) => {
    if (ligar) {
      pedirCalendario();
      return;
    }
    setCalendarios(null);
    executar(async () => {
      await desligarAgenda();
    });
  };

  const escolher = (calendario: CalendarioGoogle) =>
    executar(async () => {
      await ativarAgenda(calendario, !!criptografiaConfigurada || config.aceitouCripto);
      await limparAvisoAgenda();
      setCalendarios(null);
      await sincronizarAgenda();
    });

  const enviarExistentes = () =>
    executar(async () => {
      const criados = await enviarTarefasExistentes();
      avisar(
        'Google Agenda',
        criados > 0 ? `${criados} tarefa(s) enviada(s) para a agenda.` : 'Não há tarefas novas para enviar.',
      );
    });

  const removerEventos = () =>
    confirmar(
      'Remover eventos do Avia',
      'Os eventos criados pelo Avia neste aparelho serão apagados da agenda, e o envio será desligado. Suas tarefas no Avia não mudam. Continuar?',
      () =>
        executar(async () => {
          const removidos = await removerEventosDaAgenda();
          setCalendarios(null);
          avisar('Google Agenda', `${removidos} evento(s) removido(s) da agenda.`);
        }),
    );

  if (!disponivel) {
    return (
      <>
        <Text style={styles.secao}>Google Agenda</Text>
        <View style={styles.cartao}>
          <Text style={styles.texto}>Disponível no app Android.</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.secao}>Google Agenda</Text>
      <View style={styles.cartao}>
        <View style={styles.linhaChave}>
          <Text style={styles.rotuloChave}>Enviar tarefas para a Google Agenda</Text>
          <Switch
            value={config.ativa}
            onValueChange={alternar}
            disabled={ocupado}
            trackColor={{ true: colors.urgentHoje }}
          />
        </View>

        {aviso && <Text style={styles.aviso}>{aviso}</Text>}

        {config.ativa && config.calendarNome && (
          <>
            <Text style={styles.calendarioAtual}>
              Agenda: {config.calendarNome}
              {config.contaNome && config.contaNome !== config.calendarNome ? ` (${config.contaNome})` : ''}
            </Text>
            <Pressable onPress={pedirCalendario} disabled={ocupado} style={styles.link}>
              <Text style={styles.linkTexto}>Trocar agenda</Text>
            </Pressable>
          </>
        )}

        {calendarios && (
          <View style={styles.lista}>
            {calendarios.length === 0 ? (
              <Text style={styles.texto}>
                Nenhuma agenda de conta Google foi encontrada neste aparelho. Confira se a conta está adicionada nas
                configurações do Android.
              </Text>
            ) : (
              <>
                <Text style={styles.tituloLista}>Escolha a agenda:</Text>
                {calendarios.map((calendario) => (
                  <Pressable
                    key={calendario.id}
                    style={styles.opcao}
                    onPress={() => escolher(calendario)}
                    disabled={ocupado}
                  >
                    <Text style={styles.opcaoNome}>{calendario.nome}</Text>
                    <Text style={styles.opcaoConta}>{calendario.conta}</Text>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}

        {(calendarios || !config.calendarId) && (
          <Text style={styles.texto}>
            Quer separar? Crie uma agenda chamada &quot;Avia&quot; no Google Agenda (pelo computador). Ela aparecerá
            nesta lista.
          </Text>
        )}
        <Text style={styles.texto}>
          Ative em apenas um aparelho para evitar eventos duplicados. A agenda é atualizada enquanto o Avia está aberto.
        </Text>
        {criptografiaBloqueada && config.ativa && (
          <Text style={styles.texto}>Tarefas bloqueadas pela criptografia só vão para a agenda depois do desbloqueio.</Text>
        )}

        {ocupado && <ActivityIndicator color={colors.urgentHoje} style={styles.carregando} />}

        {config.ativa && (
          <Pressable style={styles.botao} onPress={enviarExistentes} disabled={ocupado}>
            <Text style={styles.botaoTexto}>Enviar tarefas existentes agora</Text>
          </Pressable>
        )}
        {!!config.calendarId && (
          <Pressable style={styles.link} onPress={removerEventos} disabled={ocupado}>
            <Text style={styles.linkPerigo}>Remover eventos do Avia da agenda</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    secao: {
      fontFamily: fonts.bold,
      fontSize: 13,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      marginTop: 20,
      marginBottom: 8,
    },
    cartao: {
      marginHorizontal: 16,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    linhaChave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    rotuloChave: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
    texto: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 10 },
    aviso: { fontFamily: fonts.medium, fontSize: 12, color: colors.danger, marginTop: 10 },
    calendarioAtual: { fontFamily: fonts.regular, fontSize: 13, color: colors.textPrimary, marginTop: 10 },
    lista: { marginTop: 10 },
    tituloLista: { fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary, marginBottom: 6 },
    opcao: {
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    opcaoNome: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
    opcaoConta: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    carregando: { marginTop: 12 },
    botao: {
      marginTop: 12,
      backgroundColor: colors.urgentHoje,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    botaoTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
    link: { marginTop: 8, paddingVertical: 4 },
    linkTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.urgentHoje },
    linkPerigo: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger, textAlign: 'center' },
  });
}
