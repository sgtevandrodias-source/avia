import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRoute } from '@react-navigation/native';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CampoPensamento } from '../components/CampoPensamento';
import { useAlivia } from '../context/AliviaContext';
import type { Pensamento, PensamentoEnviado, PensamentoRecebido } from '../alivia/tipos';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';
import { avisar, confirmar } from '../utils/confirm';
import { useTecladoAberto } from '../utils/useTecladoAberto';

type Aba = 'meus' | 'recebidos';

const LABEL_STATUS: Record<PensamentoEnviado['status'], string> = {
  pendente: 'aguardando',
  aceito: 'aceito',
  recusado: 'recusado',
};

// Sem acento e sem caixa, pra "ansiedade" achar "Ansiedade" (mesmo critério da busca de tarefas).
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function tituloDoDia(iso: string): string {
  const data = parseISO(iso);
  if (isToday(data)) return 'Hoje';
  if (isYesterday(data)) return 'Ontem';
  const texto = format(data, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function dataHora(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm");
}

/** Texto pro menu de compartilhar do celular (WhatsApp, e-mail...) — do mais antigo pro mais recente. */
function textoParaCompartilhar(pensamentos: Pensamento[]): string {
  const ordenados = [...pensamentos].sort((a, b) => a.registradoEm.localeCompare(b.registradoEm));
  const blocos = ordenados.map((p) => `📅 ${dataHora(p.registradoEm)}\n${p.texto}`);
  return `${blocos.join('\n\n')}\n\n— registrado no Avia que alivia!`;
}

/** Confirmação com o texto do botão sob medida (o confirmar() padrão usa "Confirmar" em vermelho). */
function confirmarAcao(titulo: string, mensagem: string, rotuloBotao: string, aoConfirmar: () => void): void {
  if (Platform.OS === 'web') {
    confirmar(titulo, mensagem, aoConfirmar);
    return;
  }
  Alert.alert(titulo, mensagem, [
    { text: 'Cancelar', style: 'cancel' },
    { text: rotuloBotao, onPress: aoConfirmar },
  ]);
}

export function AliviaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const insets = useSafeAreaInsets();
  const tecladoAberto = useTecladoAberto();
  const route = useRoute<any>();
  const {
    pensamentos,
    enviados,
    recebidos,
    carregando,
    quantidadeConvitesPendentes,
    escritaBloqueada,
    recarregar,
    criar,
    editar,
    apagar,
    compartilharComUsuario,
    removerCompartilhamento,
  } = useAlivia();

  const [aba, setAba] = useState<Aba>('meus');
  const [busca, setBusca] = useState('');
  const [texto, setTexto] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string> | null>(null);
  const [modalEmailAberto, setModalEmailAberto] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  // Notificação de registro compartilhado abre direto na aba "Compartilhados comigo".
  useEffect(() => {
    if (route.params?.aba === 'recebidos') setAba('recebidos');
  }, [route.params]);

  const enviadosPorPensamento = useMemo(() => {
    const mapa = new Map<string, PensamentoEnviado[]>();
    for (const e of enviados) {
      mapa.set(e.pensamentoId, [...(mapa.get(e.pensamentoId) ?? []), e]);
    }
    return mapa;
  }, [enviados]);

  const secoes = useMemo(() => {
    const termo = normalizar(busca.trim());
    const filtrados = termo
      ? pensamentos.filter((p) => !p.bloqueado && normalizar(p.texto).includes(termo))
      : pensamentos;
    const grupos = new Map<string, Pensamento[]>();
    for (const p of filtrados) {
      const dia = format(parseISO(p.registradoEm), 'yyyy-MM-dd');
      grupos.set(dia, [...(grupos.get(dia) ?? []), p]);
    }
    return [...grupos.values()].map((lista) => ({ title: tituloDoDia(lista[0].registradoEm), data: lista }));
  }, [pensamentos, busca]);

  const enviar = async () => {
    const limpo = texto.trim();
    if (!limpo) return;
    setSalvando(true);
    try {
      if (editandoId) {
        await editar(editandoId, limpo);
        setEditandoId(null);
      } else {
        await criar(limpo);
      }
      setTexto('');
    } catch (erro) {
      avisar('Não foi possível salvar', erro instanceof Error ? erro.message : 'Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const comecarEdicao = (p: Pensamento) => {
    setEditandoId(p.id);
    setTexto(p.texto);
    setExpandidoId(null);
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setTexto('');
  };

  const pedirApagar = (p: Pensamento) => {
    const compartilhado = (enviadosPorPensamento.get(p.id)?.length ?? 0) > 0;
    confirmar(
      'Apagar registro?',
      compartilhado
        ? 'Ele também deixa de aparecer para quem você compartilhou. Não dá pra desfazer.'
        : 'Não dá pra desfazer.',
      async () => {
        try {
          await apagar(p.id);
          if (editandoId === p.id) cancelarEdicao();
        } catch {
          avisar('Não foi possível apagar', 'Verifique sua conexão e tente de novo.');
        }
      },
    );
  };

  const alternarSelecao = (id: string) => {
    setSelecionados((atual) => {
      const novo = new Set(atual ?? []);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  };

  const iniciarSelecao = (id: string) => {
    setExpandidoId(null);
    setSelecionados(new Set([id]));
  };

  const pensamentosSelecionados = useMemo(
    () => pensamentos.filter((p) => selecionados?.has(p.id)),
    [pensamentos, selecionados],
  );

  const compartilharPeloCelular = async () => {
    const mensagem = textoParaCompartilhar(pensamentosSelecionados);
    try {
      if (Platform.OS === 'web') {
        const nav = globalThis.navigator as Navigator | undefined;
        if (nav?.share) {
          await nav.share({ text: mensagem });
        } else {
          await Clipboard.setStringAsync(mensagem);
          avisar('Texto copiado', 'Cole onde quiser enviar (WhatsApp, e-mail...).');
        }
      } else {
        await Share.share({ message: mensagem });
      }
      setSelecionados(null);
    } catch {
      // Pessoa fechou o menu de compartilhar sem escolher nada — nada a fazer.
    }
  };

  const compartilharComEmail = (email: string) => {
    const quantidade = pensamentosSelecionados.length;
    const oQue = quantidade === 1 ? 'Este registro será visível' : `Estes ${quantidade} registros serão visíveis`;
    confirmarAcao(
      'Compartilhar?',
      `${oQue} para ${email}.\n\n` +
        'A pessoa precisa aceitar e só pode ler — não pode editar. Você pode desfazer quando quiser.\n\n' +
        'A cópia compartilhada fica guardada no servidor do Avia sem a criptografia ponta a ponta, ' +
        'como já acontece com os compromissos compartilhados.',
      'Compartilhar',
      async () => {
        try {
          await compartilharComUsuario(email, pensamentosSelecionados);
          setModalEmailAberto(false);
          setSelecionados(null);
          avisar('Pronto!', `Enviado para ${email}. O registro aparece pra ela assim que aceitar.`);
        } catch (erro) {
          avisar('Não foi possível compartilhar', erro instanceof Error ? erro.message : 'Tente de novo.');
        }
      },
    );
  };

  const desfazerCompartilhamento = (e: PensamentoEnviado) => {
    confirmarAcao(
      'Desfazer compartilhamento?',
      `${e.destinatarioNome} deixa de ver este registro.`,
      'Desfazer',
      async () => {
        try {
          await removerCompartilhamento(e.id);
        } catch {
          avisar('Não foi possível desfazer', 'Verifique sua conexão e tente de novo.');
        }
      },
    );
  };

  const atualizar = async () => {
    setAtualizando(true);
    await recarregar();
    setAtualizando(false);
  };

  const emSelecao = selecionados != null;
  const paddingRodape = tecladoAberto ? 0 : insets.bottom;

  const renderPensamento = ({ item }: { item: Pensamento }) => {
    const compartilhamentos = enviadosPorPensamento.get(item.id) ?? [];
    const selecionado = selecionados?.has(item.id) ?? false;
    const expandido = expandidoId === item.id && !emSelecao;
    return (
      <Pressable
        style={[styles.card, selecionado && styles.cardSelecionado]}
        onPress={() => {
          if (item.bloqueado) return;
          if (emSelecao) alternarSelecao(item.id);
          else setExpandidoId(expandido ? null : item.id);
        }}
        onLongPress={() => !item.bloqueado && !emSelecao && iniciarSelecao(item.id)}
      >
        <View style={styles.cardTopo}>
          {emSelecao && (
            <Ionicons
              name={selecionado ? 'checkbox' : 'square-outline'}
              size={20}
              color={selecionado ? colors.marca : colors.textMuted}
            />
          )}
          <Text style={styles.cardHora}>{format(parseISO(item.registradoEm), 'HH:mm')}</Text>
          {item.atualizadoEm !== item.registradoEm && <Text style={styles.cardEditado}>· editado</Text>}
        </View>
        <Text style={[styles.cardTexto, item.bloqueado && styles.cardTextoBloqueado]}>
          {item.bloqueado ? '🔒 Registro protegido — desbloqueie a criptografia em Configurações para ler.' : item.texto}
        </Text>
        {compartilhamentos.map((e) => (
          <View key={e.id} style={styles.chipCompartilhado}>
            <Text style={styles.chipCompartilhadoTexto} numberOfLines={1}>
              👤 {e.destinatarioNome} · {LABEL_STATUS[e.status]}
            </Text>
            <Pressable
              onPress={() => desfazerCompartilhamento(e)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Desfazer compartilhamento com ${e.destinatarioNome}`}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}
        {expandido && (
          <View style={styles.cardAcoes}>
            <Pressable style={styles.acao} onPress={() => comecarEdicao(item)}>
              <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.acaoTexto}>Editar</Text>
            </Pressable>
            <Pressable style={styles.acao} onPress={() => iniciarSelecao(item.id)}>
              <Ionicons name="share-social-outline" size={16} color={colors.textPrimary} />
              <Text style={styles.acaoTexto}>Compartilhar</Text>
            </Pressable>
            <Pressable style={styles.acao} onPress={() => pedirApagar(item)}>
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text style={[styles.acaoTexto, { color: colors.danger }]}>Apagar</Text>
            </Pressable>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.abas}>
        <Pressable style={[styles.aba, aba === 'meus' && styles.abaAtiva]} onPress={() => setAba('meus')}>
          <Text style={[styles.abaTexto, aba === 'meus' && styles.abaTextoAtivo]}>Meus registros</Text>
        </Pressable>
        <Pressable style={[styles.aba, aba === 'recebidos' && styles.abaAtiva]} onPress={() => setAba('recebidos')}>
          <Text style={[styles.abaTexto, aba === 'recebidos' && styles.abaTextoAtivo]} numberOfLines={1}>
            Compartilhados comigo
          </Text>
          {quantidadeConvitesPendentes > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeTexto}>{quantidadeConvitesPendentes}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {aba === 'meus' ? (
        <>
          <View style={styles.buscaLinha}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.buscaInput}
              placeholder="Buscar nos meus registros..."
              placeholderTextColor={colors.textMuted}
              value={busca}
              onChangeText={setBusca}
            />
            {busca.length > 0 && (
              <Pressable onPress={() => setBusca('')} hitSlop={8} accessibilityLabel="Limpar busca">
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          <SectionList
            sections={secoes}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.lista}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            onRefresh={atualizar}
            refreshing={atualizando}
            renderSectionHeader={({ section }) => <Text style={styles.secaoTitulo}>{section.title}</Text>}
            renderItem={renderPensamento}
            ListEmptyComponent={
              carregando ? (
                <ActivityIndicator style={{ marginTop: 40 }} color={colors.marca} />
              ) : (
                <View style={styles.vazio}>
                  <Text style={styles.vazioTitulo}>{busca ? 'Nada encontrado.' : 'Um espaço só seu 🌿'}</Text>
                  {!busca && (
                    <Text style={styles.vazioTexto}>
                      Escreva ou fale o que está sentindo ou pensando. Seus registros são privados — só você vê,
                      a não ser que decida compartilhar.
                    </Text>
                  )}
                </View>
              )
            }
          />
          <View style={{ backgroundColor: colors.surface, paddingBottom: paddingRodape }}>
            {emSelecao ? (
              <View style={styles.barraSelecao}>
                <Text style={styles.barraSelecaoTexto}>
                  {pensamentosSelecionados.length} selecionado{pensamentosSelecionados.length === 1 ? '' : 's'}
                </Text>
                <View style={styles.barraSelecaoBotoes}>
                  <Pressable style={styles.botaoSecundario} onPress={() => setSelecionados(null)}>
                    <Text style={styles.botaoSecundarioTexto}>Cancelar</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.botaoPrimario, pensamentosSelecionados.length === 0 && styles.botaoDesabilitado]}
                    disabled={pensamentosSelecionados.length === 0}
                    onPress={compartilharPeloCelular}
                  >
                    <Ionicons name="phone-portrait-outline" size={15} color={colors.white} />
                    <Text style={styles.botaoPrimarioTexto}>Pelo celular</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.botaoPrimario, pensamentosSelecionados.length === 0 && styles.botaoDesabilitado]}
                    disabled={pensamentosSelecionados.length === 0}
                    onPress={() => setModalEmailAberto(true)}
                  >
                    <Ionicons name="person-outline" size={15} color={colors.white} />
                    <Text style={styles.botaoPrimarioTexto}>Usuário Avia</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <CampoPensamento
                texto={texto}
                onChangeTexto={setTexto}
                onEnviar={enviar}
                editando={editandoId != null}
                onCancelarEdicao={cancelarEdicao}
                desabilitado={escritaBloqueada}
                salvando={salvando}
              />
            )}
          </View>
        </>
      ) : (
        <ListaRecebidos recebidos={recebidos} carregando={carregando} paddingRodape={paddingRodape} onAtualizar={atualizar} atualizando={atualizando} />
      )}

      <ModalEmail
        visivel={modalEmailAberto}
        quantidade={pensamentosSelecionados.length}
        onFechar={() => setModalEmailAberto(false)}
        onContinuar={compartilharComEmail}
      />
    </SafeAreaView>
  );
}

function ModalEmail({
  visivel,
  quantidade,
  onFechar,
  onContinuar,
}: {
  visivel: boolean;
  quantidade: number;
  onFechar: () => void;
  onContinuar: (email: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const [email, setEmail] = useState('');
  const valido = /^\S+@\S+\.\S+$/.test(email.trim());

  useEffect(() => {
    if (visivel) setEmail('');
  }, [visivel]);

  return (
    <Modal visible={visivel} transparent animationType="fade" onRequestClose={onFechar}>
      <View style={styles.modalFundo}>
        <View style={styles.modalCaixa}>
          <Text style={styles.modalTitulo}>Compartilhar com usuário do Avia</Text>
          <Text style={styles.modalTexto}>
            {quantidade === 1 ? '1 registro selecionado.' : `${quantidade} registros selecionados.`} Digite o e-mail da
            conta Avia da pessoa (ex.: sua psicóloga).
          </Text>
          <TextInput
            style={styles.modalInput}
            placeholder="email@exemplo.com"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          <View style={styles.modalBotoes}>
            <Pressable style={styles.botaoSecundario} onPress={onFechar}>
              <Text style={styles.botaoSecundarioTexto}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.botaoPrimario, !valido && styles.botaoDesabilitado]}
              disabled={!valido}
              onPress={() => onContinuar(email.trim())}
            >
              <Text style={styles.botaoPrimarioTexto}>Continuar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ListaRecebidos({
  recebidos,
  carregando,
  paddingRodape,
  onAtualizar,
  atualizando,
}: {
  recebidos: PensamentoRecebido[];
  carregando: boolean;
  paddingRodape: number;
  onAtualizar: () => void;
  atualizando: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { responder, removerCompartilhamento } = useAlivia();
  const [respondendoId, setRespondendoId] = useState<string | null>(null);

  const pendentes = recebidos.filter((r) => r.status === 'pendente');
  const aceitos = recebidos.filter((r) => r.status === 'aceito');
  const secoes = [
    ...(pendentes.length ? [{ title: 'Aguardando sua resposta', data: pendentes }] : []),
    ...(aceitos.length ? [{ title: 'Registros compartilhados com você', data: aceitos }] : []),
  ];

  const tratarResposta = async (id: string, aceitar: boolean) => {
    setRespondendoId(id);
    try {
      await responder(id, aceitar);
    } catch {
      avisar('Não foi possível responder', 'Verifique sua conexão e tente de novo.');
    } finally {
      setRespondendoId(null);
    }
  };

  const pedirRemover = (r: PensamentoRecebido) => {
    confirmar('Remover da sua lista?', `Você deixa de ver este registro de ${r.criadorNome}.`, async () => {
      try {
        await removerCompartilhamento(r.id);
      } catch {
        avisar('Não foi possível remover', 'Verifique sua conexão e tente de novo.');
      }
    });
  };

  return (
    <SectionList
      sections={secoes}
      keyExtractor={(r) => r.id}
      contentContainerStyle={[styles.lista, { paddingBottom: 24 + paddingRodape }]}
      stickySectionHeadersEnabled={false}
      onRefresh={onAtualizar}
      refreshing={atualizando}
      renderSectionHeader={({ section }) => <Text style={styles.secaoTitulo}>{section.title}</Text>}
      renderItem={({ item }) =>
        item.status === 'pendente' ? (
          <View style={styles.card}>
            <Text style={styles.cardTexto}>
              <Text style={styles.negrito}>{item.criadorNome}</Text> quer compartilhar com você um registro de{' '}
              {dataHora(item.registradoEm)}.
            </Text>
            <Text style={styles.cardDica}>Você só poderá ler. O texto aparece depois que você aceitar.</Text>
            {respondendoId === item.id ? (
              <ActivityIndicator style={{ marginTop: 10 }} color={colors.marca} />
            ) : (
              <View style={styles.cardAcoes}>
                <Pressable style={styles.botaoSecundario} onPress={() => tratarResposta(item.id, false)}>
                  <Text style={styles.botaoSecundarioTexto}>Recusar</Text>
                </Pressable>
                <Pressable style={[styles.botaoPrimario, { backgroundColor: colors.done }]} onPress={() => tratarResposta(item.id, true)}>
                  <Text style={styles.botaoPrimarioTexto}>Aceitar</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.cardTopo}>
              <Text style={styles.cardDe}>De {item.criadorNome}</Text>
              <Text style={styles.cardHora}>· {dataHora(item.registradoEm)}</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => pedirRemover(item)} hitSlop={8} accessibilityLabel="Remover da minha lista">
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.cardTexto}>{item.texto}</Text>
          </View>
        )
      }
      ListEmptyComponent={
        carregando ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.marca} />
        ) : (
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Ninguém compartilhou registros com você ainda.</Text>
          </View>
        )
      }
    />
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    abas: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    aba: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    abaAtiva: { borderColor: colors.marca, backgroundColor: colors.marca },
    abaTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
    abaTextoAtivo: { fontFamily: fonts.bold, color: colors.white },
    // No canto da aba (fora do fluxo do texto) — senão "Compartilhados
    // comigo" quebrava em duas linhas em telas estreitas.
    badge: {
      position: 'absolute',
      top: -6,
      right: -4,
      backgroundColor: colors.danger,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    badgeTexto: { fontFamily: fonts.bold, fontSize: 10, color: colors.white },
    buscaLinha: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    buscaInput: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 14,
      paddingVertical: 9,
      color: colors.textPrimary,
    },
    lista: { paddingHorizontal: 16, paddingBottom: 24 },
    secaoTitulo: {
      fontFamily: fonts.bold,
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardSelecionado: { borderColor: colors.marca, borderWidth: 2 },
    cardTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    cardHora: { fontFamily: fonts.medium, fontSize: 12, color: colors.textMuted },
    cardEditado: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted },
    cardDe: { fontFamily: fonts.bold, fontSize: 12, color: colors.marca },
    cardTexto: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.textPrimary },
    cardTextoBloqueado: { color: colors.textMuted, fontSize: 13 },
    cardDica: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 6 },
    negrito: { fontFamily: fonts.bold },
    chipCompartilhado: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingLeft: 10,
      paddingRight: 6,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    chipCompartilhadoTexto: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
    cardAcoes: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    acao: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    acaoTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textPrimary },
    vazio: { paddingTop: 48, paddingHorizontal: 24, alignItems: 'center' },
    vazioTitulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.textPrimary, marginBottom: 6 },
    vazioTexto: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
    barraSelecao: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    barraSelecaoTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
    barraSelecaoBotoes: { flexDirection: 'row', gap: 8 },
    botaoSecundario: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botaoSecundarioTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
    botaoPrimario: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.marca,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botaoPrimarioTexto: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
    botaoDesabilitado: { opacity: 0.4 },
    modalFundo: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCaixa: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, gap: 12 },
    modalTitulo: { fontFamily: fonts.bold, fontSize: 17, color: colors.textPrimary },
    modalTexto: { fontFamily: fonts.regular, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    modalInput: {
      fontFamily: fonts.regular,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    modalBotoes: { flexDirection: 'row', gap: 8 },
  });
}
