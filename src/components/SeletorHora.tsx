import React, { useEffect, useRef } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

const HORARIOS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    HORARIOS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

const ALTURA_ITEM = 48;

interface Props {
  visivel: boolean;
  valorAtual: string;
  onSelecionar: (hora: string) => void;
  onFechar: () => void;
}

export function SeletorHora({ visivel, valorAtual, onSelecionar, onFechar }: Props) {
  const listRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (!visivel) return;
    const indice = HORARIOS.indexOf(valorAtual);
    if (indice < 0) return;
    const timeout = setTimeout(() => {
      listRef.current?.scrollToIndex({ index: indice, animated: false, viewPosition: 0.4 });
    }, 50);
    return () => clearTimeout(timeout);
  }, [visivel, valorAtual]);

  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <Pressable style={styles.overlay} onPress={onFechar}>
        <View style={styles.folha}>
          <Text style={styles.titulo}>Selecione o horário</Text>
          <FlatList
            ref={listRef}
            data={HORARIOS}
            keyExtractor={(h) => h}
            getItemLayout={(_, index) => ({ length: ALTURA_ITEM, offset: ALTURA_ITEM * index, index })}
            initialScrollIndex={Math.max(HORARIOS.indexOf(valorAtual), 0)}
            onScrollToIndexFailed={() => {}}
            style={styles.lista}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.item, item === valorAtual && styles.itemAtivo]}
                onPress={() => {
                  onSelecionar(item);
                  onFechar();
                }}
              >
                <Text style={[styles.itemTexto, item === valorAtual && styles.itemTextoAtivo]}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  folha: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingTop: 16,
    paddingBottom: 8,
  },
  titulo: { fontFamily: fonts.bold, fontSize: 16, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  lista: { paddingHorizontal: 16 },
  item: { height: ALTURA_ITEM, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  itemAtivo: { backgroundColor: colors.urgentHoje },
  itemTexto: { fontFamily: fonts.medium, fontSize: 16, color: colors.textPrimary },
  itemTextoAtivo: { color: colors.white, fontFamily: fonts.bold },
});
