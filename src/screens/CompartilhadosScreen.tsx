import React from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import { useCompartilhamentos } from '../context/CompartilhamentosContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import type { ItemCompartilhadoLocal } from '../types/item';

const SECAO_RECEBIDOS = 'Convites recebidos';
const SECAO_ENVIADOS = 'Compartilhados por você';

const LABEL_STATUS: Record<ItemCompartilhadoLocal['status'], string> = {
  pendente: 'Pendente',
  aceito: 'Aceito',
  recusado: 'Recusado',
};

function LinhaRecebido({ item }: { item: ItemCompartilhadoLocal }) {
  const { responderCompartilhamento } = useCompartilhamentos();
  const [respondendo, setRespondendo] = React.useState(false);

  const responder = async (aceitar: boolean) => {
    setRespondendo(true);
    try {
      await responderCompartilhamento(item.id, aceitar);
    } finally {
      setRespondendo(false);
    }
  };

  return (
    <View style={styles.linha}>
      <View style={styles.linhaInfo}>
        <Text style={styles.linhaTitulo}>{item.titulo}</Text>
        <Text style={styles.linhaSubtitulo}>
          De {item.criadorNome} · {format(parseISO(item.data), 'dd/MM/yyyy')}
        </Text>
      </View>
      {item.status === 'pendente' ? (
        respondendo ? (
          <ActivityIndicator color={colors.urgentHoje} />
        ) : (
          <View style={styles.linhaAcoes}>
            <Pressable style={styles.botaoRecusar} onPress={() => responder(false)}>
              <Text style={styles.botaoRecusarTexto}>Recusar</Text>
            </Pressable>
            <Pressable style={styles.botaoAceitar} onPress={() => responder(true)}>
              <Text style={styles.botaoAceitarTexto}>Aceitar</Text>
            </Pressable>
          </View>
        )
      ) : (
        <Text style={[styles.tagStatus, item.status === 'aceito' ? styles.tagAceito : styles.tagRecusado]}>
          {LABEL_STATUS[item.status]}
        </Text>
      )}
    </View>
  );
}

function LinhaEnviado({ item }: { item: ItemCompartilhadoLocal }) {
  return (
    <View style={styles.linha}>
      <View style={styles.linhaInfo}>
        <Text style={styles.linhaTitulo}>{item.titulo}</Text>
        <Text style={styles.linhaSubtitulo}>Com {item.destinatarioNome ?? '—'}</Text>
      </View>
      <Text style={[styles.tagStatus, item.status === 'aceito' ? styles.tagAceito : item.status === 'recusado' ? styles.tagRecusado : styles.tagPendente]}>
        {LABEL_STATUS[item.status]}
      </Text>
    </View>
  );
}

export function CompartilhadosScreen() {
  const { enviados, recebidos, carregando } = useCompartilhamentos();

  const secoes = [
    { title: SECAO_RECEBIDOS, data: recebidos },
    { title: SECAO_ENVIADOS, data: enviados },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <SectionList
        sections={secoes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.lista}
        renderSectionHeader={({ section }) => <Text style={styles.secaoTitulo}>{section.title}</Text>}
        renderItem={({ item, section }) =>
          section.title === SECAO_RECEBIDOS ? <LinhaRecebido item={item} /> : <LinhaEnviado item={item} />
        }
        renderSectionFooter={({ section }) =>
          !carregando && section.data.length === 0 ? (
            <Text style={styles.vazioSecao}>
              {section.title === SECAO_RECEBIDOS ? 'Nenhum convite recebido.' : 'Você não compartilhou nada ainda.'}
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  lista: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  secaoTitulo: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  vazioSecao: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: 8,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  linhaInfo: { flex: 1 },
  linhaTitulo: { fontFamily: fonts.medium, fontSize: 14, color: colors.textPrimary },
  linhaSubtitulo: { fontFamily: fonts.regular, fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  linhaAcoes: { flexDirection: 'row', gap: 8 },
  botaoAceitar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.done,
  },
  botaoAceitarTexto: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  botaoRecusar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  botaoRecusarTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  tagStatus: {
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tagPendente: { backgroundColor: colors.prioritySoft, color: colors.textPrimary },
  tagAceito: { backgroundColor: colors.doneSoft, color: colors.done },
  tagRecusado: { backgroundColor: colors.background, color: colors.textMuted },
});
