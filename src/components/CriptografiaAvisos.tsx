import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { foiAvisoDispensado, salvarAvisoDispensado } from '../crypto/chaveCriptografia';
import { navegarPara } from '../navigation/navigationRef';
import { useTheme } from '../theme/ThemeContext';
import type { Paleta } from '../theme/paletas';
import { fonts } from '../theme/typography';

// Dois avisos sobre a criptografia opcional, renderizados uma vez (fora da
// árvore de cada tela, junto do TopBar/CapturaRapida — ver navigation/index.tsx):
// 1. Banner fixo quando este aparelho está bloqueado (conta tem criptografia
//    configurada, mas falta a chave aqui) — nunca trava o app, só convida a
//    desbloquear.
// 2. Modal único, pulável, oferecendo configurar a criptografia — só aparece
//    uma vez por conta+aparelho (ver foiAvisoDispensado).
export function CriptografiaAvisos() {
  const { colors } = useTheme();
  const styles = useMemo(() => criarEstilos(colors), [colors]);
  const { usuario, criptografiaConfigurada, criptografiaBloqueada } = useAuth();
  const [mostrarOferta, setMostrarOferta] = useState(false);

  useEffect(() => {
    if (!usuario || criptografiaConfigurada !== false) {
      setMostrarOferta(false);
      return;
    }
    let cancelado = false;
    foiAvisoDispensado(usuario.id).then((dispensado) => {
      if (!cancelado && !dispensado) setMostrarOferta(true);
    });
    return () => {
      cancelado = true;
    };
  }, [usuario, criptografiaConfigurada]);

  const dispensar = () => {
    if (usuario) salvarAvisoDispensado(usuario.id);
    setMostrarOferta(false);
  };

  const configurarAgora = () => {
    setMostrarOferta(false);
    navegarPara('ConfigurarCriptografia');
  };

  return (
    <>
      {criptografiaBloqueada && (
        <Pressable style={styles.banner} onPress={() => navegarPara('DesbloquearCriptografia')}>
          <Text style={styles.bannerTexto}>🔒 Alguns itens estão bloqueados — toque pra desbloquear</Text>
        </Pressable>
      )}

      <Modal visible={mostrarOferta} transparent animationType="fade" onRequestClose={dispensar}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitulo}>Proteger seus dados</Text>
            <Text style={styles.modalTexto}>
              Você pode cifrar o conteúdo dos seus itens (título, descrição e notas) com uma frase secreta só sua —
              nem quem administra o AVIA consegue ler depois disso. É opcional e leva menos de um minuto.
            </Text>
            <Pressable style={styles.botaoPrimario} onPress={configurarAgora}>
              <Text style={styles.botaoPrimarioTexto}>Configurar agora</Text>
            </Pressable>
            <Pressable style={styles.botaoSecundario} onPress={dispensar}>
              <Text style={styles.botaoSecundarioTexto}>Agora não</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function criarEstilos(colors: Paleta) {
  return StyleSheet.create({
  banner: {
    backgroundColor: colors.prioritySoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.priority,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerTexto: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitulo: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 10,
  },
  modalTexto: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
  },
  botaoPrimario: {
    marginTop: 18,
    backgroundColor: colors.urgentHoje,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  botaoPrimarioTexto: { fontFamily: fonts.bold, fontSize: 14, color: colors.white },
  botaoSecundario: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  botaoSecundarioTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary },
  });
}
