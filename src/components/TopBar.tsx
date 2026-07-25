import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { ItemCard } from './ItemCard';
import { useAuth } from '../auth/AuthContext';
import { useItems } from '../context/ItemsContext';
import { abrirDrawer } from '../navigation/navigationRef';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import type { Item } from '../types/item';

interface Props {
  titulo: string;
  // Na Hoje, o título vira a saudação "Avia, Nome!" em fonte maior — nas
  // demais telas mostra só o título simples (ver melhoria de UI pedida).
  saudacao?: boolean;
  cor?: string;
}

// Sem acento e sem caixa, pra "aniversario" achar "Aniversário".
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Cabeçalho reutilizado em toda tela do Drawer: menu (☰) + título/saudação +
 * lupa. Resolve duas coisas de uma vez — a melhoria de UI pedida pra Hoje, e
 * o bug de faltar um jeito de voltar/abrir o menu nas outras telas
 * (Calendário, Atrasados, Feitos, Configurações), que hoje só tinham título
 * sem nenhum botão.
 */
// Tamanho da saudação "Avia, Nome!" se ajusta pra sempre caber numa linha só
// — nunca corta (ex.: "Pedro Henrique"), mas também não fica pequena à toa
// quando o nome já é curto (ex.: "Ana" continua grande e destacada). Mede o
// texto de verdade via onLayout em vez de advinhar pelo comprimento da
// string — adjustsFontSizeToFit/onTextLayout não são confiáveis no build
// web, então essa é a única forma que funciona em toda plataforma.
const SAUDACAO_TAMANHO_MAX = 42;
const SAUDACAO_TAMANHO_MIN = 18;

function useSaudacaoAjustada(texto: string) {
  const [tamanho, setTamanho] = useState(SAUDACAO_TAMANHO_MAX);
  const [larguraContainer, setLarguraContainer] = useState<number | null>(null);
  const [larguraTexto, setLarguraTexto] = useState<number | null>(null);

  // Texto mudou (outro usuário logou, nome carregou depois) — mede de novo
  // a partir do tamanho máximo.
  useEffect(() => {
    setTamanho(SAUDACAO_TAMANHO_MAX);
    setLarguraTexto(null);
  }, [texto]);

  useEffect(() => {
    if (larguraContainer == null || larguraTexto == null) return;
    if (larguraTexto > larguraContainer && tamanho > SAUDACAO_TAMANHO_MIN) {
      const proporcao = larguraContainer / larguraTexto;
      const proximoTamanho = Math.max(SAUDACAO_TAMANHO_MIN, Math.floor(tamanho * proporcao * 0.94));
      if (proximoTamanho < tamanho) setTamanho(proximoTamanho);
    }
  }, [larguraContainer, larguraTexto, tamanho]);

  return {
    tamanho,
    onContainerLayout: (e: { nativeEvent: { layout: { width: number } } }) =>
      setLarguraContainer(e.nativeEvent.layout.width),
    onTextLayout: (e: { nativeEvent: { layout: { width: number } } }) => setLarguraTexto(e.nativeEvent.layout.width),
  };
}

export function TopBar({ titulo, saudacao, cor = colors.border }: Props) {
  const navigation = useNavigation<any>();
  const { usuario } = useAuth();
  const { itens, alternarStatus } = useItems();
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termo, setTermo] = useState('');

  const primeiroNome = usuario?.nome?.trim().split(/\s+/)[0] ?? '';
  const textoSaudacao = `Avia, ${primeiroNome}!`;
  const { tamanho: tamanhoSaudacao, onContainerLayout, onTextLayout } = useSaudacaoAjustada(textoSaudacao);

  // Busca por palavra em QUALQUER data — varre todos os itens já carregados
  // (ItemsContext mantém tudo em memória), sem filtro de período.
  const resultados = useMemo<Item[]>(() => {
    const termoNormalizado = normalizar(termo.trim());
    if (!termoNormalizado) return [];
    return itens.filter(
      (item) =>
        normalizar(item.titulo).includes(termoNormalizado) ||
        normalizar(item.textoOriginal).includes(termoNormalizado),
    );
  }, [itens, termo]);

  const fecharBusca = () => {
    setBuscaAberta(false);
    setTermo('');
  };

  return (
    <View style={[styles.header, { borderBottomColor: cor }]}>
      <View style={styles.linha}>
        <Pressable onPress={abrirDrawer} style={styles.botaoIcone} hitSlop={8}>
          <Text style={styles.iconeMenu}>☰</Text>
        </Pressable>
        {saudacao ? (
          <View style={styles.saudacaoContainer} onLayout={onContainerLayout}>
            {/* Medidor invisível: mesma fonte, sem limite de largura (fora do
                fluxo normal), só pra descobrir a largura NATURAL do texto no
                tamanho atual e decidir se precisa encolher mais. */}
            <Text
              style={[styles.saudacaoTexto, styles.medidorInvisivel, { fontSize: tamanhoSaudacao }]}
              numberOfLines={1}
              onLayout={onTextLayout}
            >
              {textoSaudacao}
            </Text>
            <Text style={[styles.saudacaoTexto, { fontSize: tamanhoSaudacao }]} numberOfLines={1}>
              {textoSaudacao}
            </Text>
          </View>
        ) : (
          <Text style={styles.texto} numberOfLines={1}>
            {titulo}
          </Text>
        )}
        <Pressable
          onPress={() => (buscaAberta ? fecharBusca() : setBuscaAberta(true))}
          style={styles.botaoIcone}
          hitSlop={8}
        >
          <Ionicons name={buscaAberta ? 'close' : 'search'} size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {buscaAberta && (
        <View style={styles.buscaContainer}>
          <TextInput
            style={styles.buscaInput}
            placeholder="Buscar em qualquer data..."
            placeholderTextColor={colors.textMuted}
            value={termo}
            onChangeText={setTermo}
            autoFocus
          />
          {termo.trim().length > 0 && (
            <View style={styles.resultadosWrapper}>
              <FlatList
                data={resultados}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <ItemCard
                    item={item}
                    corPendente={colors.urgentHoje}
                    onToggle={() => alternarStatus(item.id)}
                    onPress={() => {
                      fecharBusca();
                      navigation.navigate('DetalheItem', { itemId: item.id });
                    }}
                  />
                )}
                ListEmptyComponent={
                  <Text style={styles.semResultados}>Nada encontrado com &quot;{termo.trim()}&quot;.</Text>
                }
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 3,
    backgroundColor: colors.background,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  botaoIcone: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconeMenu: {
    fontSize: 20,
    color: colors.textPrimary,
  },
  saudacaoContainer: {
    flex: 1,
  },
  saudacaoTexto: {
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
  },
  medidorInvisivel: {
    position: 'absolute',
    opacity: 0,
    // maxWidth explícito bem largo: sem isso, o medidor herda um limite de
    // largura do container flex pai (mesmo sendo position:absolute) e quebra
    // em várias linhas em vez de revelar a largura natural do texto numa
    // linha só, o que inviabilizava a medição.
    maxWidth: 9999,
    width: 'auto',
  },
  texto: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: colors.textPrimary,
  },
  buscaContainer: {
    marginTop: 10,
  },
  buscaInput: {
    fontFamily: fonts.regular,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  resultadosWrapper: {
    maxHeight: 360,
    marginTop: 8,
  },
  semResultados: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 16,
    textAlign: 'center',
  },
});
