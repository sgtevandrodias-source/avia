import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ItemCard } from '../components/ItemCard';
import { useItems } from '../context/ItemsContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { hojeISO } from '../utils/periodos';
import type { Item } from '../types/item';

const LETRAS_DIA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface Celula {
  data: Date;
  chave: string; // yyyy-MM-dd
  noMesAtual: boolean;
}

export function CalendarioScreen() {
  const { itens, alternarStatus } = useItems();
  const navigation = useNavigation<any>();
  const [mesAtual, setMesAtual] = useState(() => startOfMonth(new Date()));
  const [diaSelecionado, setDiaSelecionado] = useState(hojeISO());

  const itensPorDia = useMemo(() => {
    const mapa = new Map<string, Item[]>();
    for (const item of itens) {
      const lista = mapa.get(item.data) ?? [];
      lista.push(item);
      mapa.set(item.data, lista);
    }
    return mapa;
  }, [itens]);

  const celulas = useMemo<Celula[]>(() => {
    const inicioMes = startOfMonth(mesAtual);
    const fimMes = endOfMonth(mesAtual);
    const diasDoMes = eachDayOfInterval({ start: inicioMes, end: fimMes });

    const offsetInicio = getDay(inicioMes); // 0 = domingo
    const diasAntes: Celula[] = [];
    for (let i = offsetInicio; i > 0; i--) {
      const data = new Date(inicioMes);
      data.setDate(data.getDate() - i);
      diasAntes.push({ data, chave: format(data, 'yyyy-MM-dd'), noMesAtual: false });
    }

    const diasMes: Celula[] = diasDoMes.map((data) => ({
      data,
      chave: format(data, 'yyyy-MM-dd'),
      noMesAtual: true,
    }));

    const totalAteAqui = diasAntes.length + diasMes.length;
    const restante = (7 - (totalAteAqui % 7)) % 7;
    const diasDepois: Celula[] = [];
    for (let i = 1; i <= restante; i++) {
      const data = new Date(fimMes);
      data.setDate(data.getDate() + i);
      diasDepois.push({ data, chave: format(data, 'yyyy-MM-dd'), noMesAtual: false });
    }

    return [...diasAntes, ...diasMes, ...diasDepois];
  }, [mesAtual]);

  const itensDoDia = itensPorDia.get(diaSelecionado) ?? [];
  const dataSelecionadaObj = parseISO(diaSelecionado);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitulo}>Calendário</Text>
      </View>

      <View style={styles.navMes}>
        <Pressable onPress={() => setMesAtual((atual) => subMonths(atual, 1))} style={styles.botaoNavMes}>
          <Text style={styles.setaNavMes}>‹</Text>
        </Pressable>
        <Text style={styles.tituloMes}>{format(mesAtual, 'MMMM yyyy', { locale: ptBR })}</Text>
        <Pressable onPress={() => setMesAtual((atual) => addMonths(atual, 1))} style={styles.botaoNavMes}>
          <Text style={styles.setaNavMes}>›</Text>
        </Pressable>
      </View>

      <View style={styles.linhaSemana}>
        {LETRAS_DIA_SEMANA.map((letra, indice) => (
          <Text key={indice} style={styles.letraDiaSemana}>
            {letra}
          </Text>
        ))}
      </View>

      <View style={styles.grade}>
        {celulas.map((celula) => {
          const itensDaCelula = itensPorDia.get(celula.chave) ?? [];
          const temPendente = itensDaCelula.some((i) => i.status === 'pendente');
          const temItem = itensDaCelula.length > 0;
          const selecionado = celula.chave === diaSelecionado;
          return (
            <Pressable
              key={celula.chave}
              style={styles.celula}
              onPress={() => setDiaSelecionado(celula.chave)}
            >
              <View
                style={[
                  styles.circuloDia,
                  selecionado && styles.circuloDiaSelecionado,
                  !selecionado && isToday(celula.data) && styles.circuloDiaHoje,
                ]}
              >
                <Text
                  style={[
                    styles.textoDia,
                    !celula.noMesAtual && styles.textoDiaFora,
                    selecionado && styles.textoDiaSelecionado,
                  ]}
                >
                  {celula.data.getDate()}
                </Text>
              </View>
              {temItem && (
                <View
                  style={[styles.pontoEvento, { backgroundColor: temPendente ? colors.urgentHoje : colors.done }]}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.subtituloLista}>
        {isSameDay(dataSelecionadaObj, new Date())
          ? 'Hoje'
          : format(dataSelecionadaObj, "EEEE, d 'de' MMMM", { locale: ptBR })}
      </Text>

      <FlatList
        data={itensDoDia}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.lista}
        renderItem={({ item }) => (
          <ItemCard
            item={item}
            corPendente={colors.urgentHoje}
            onToggle={() => alternarStatus(item.id)}
            onPress={() => navigation.navigate('DetalheItem', { itemId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.vazio}>
            <Text style={styles.vazioTexto}>Nada marcado pra esse dia.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerTitulo: { fontFamily: fonts.extraBold, fontSize: 24, color: colors.textPrimary },
  navMes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  botaoNavMes: { padding: 8 },
  setaNavMes: { fontSize: 22, fontFamily: fonts.bold, color: colors.urgentHoje },
  tituloMes: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  linhaSemana: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  letraDiaSemana: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginTop: 4,
  },
  celula: {
    width: '14.2857%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  circuloDia: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circuloDiaSelecionado: { backgroundColor: colors.urgentHoje },
  circuloDiaHoje: { borderWidth: 1.5, borderColor: colors.urgentHoje },
  textoDia: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
  textoDiaFora: { color: colors.textMuted },
  textoDiaSelecionado: { color: colors.white, fontFamily: fonts.bold },
  pontoEvento: { width: 5, height: 5, borderRadius: 2.5, marginTop: 2 },
  subtituloLista: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 6,
  },
  lista: { paddingHorizontal: 16, paddingBottom: 24 },
  vazio: { paddingTop: 20, alignItems: 'center' },
  vazioTexto: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted },
});
