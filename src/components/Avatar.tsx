import React, { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../theme/typography';

// Paleta fixa pra fundo do avatar com iniciais — cores vivas o bastante pra
// funcionar tanto no tema claro quanto no escuro, escolhidas por hash do
// e-mail (determinístico: a mesma conta sempre cai na mesma cor neste
// aparelho, mesmo depois de reabrir o app).
const CORES_INICIAIS = ['#B084F5', '#4C9AFF', '#F5A623', '#2BB3A3', '#E85D9C', '#6FCF97'];

function corPorEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) | 0;
  }
  return CORES_INICIAIS[Math.abs(hash) % CORES_INICIAIS.length];
}

function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].charAt(0).toUpperCase();
  return (partes[0].charAt(0) + partes[partes.length - 1].charAt(0)).toUpperCase();
}

interface Props {
  nome: string;
  email: string;
  fotoUrl?: string | null;
  tamanho?: number;
}

export function Avatar({ nome, email, fotoUrl, tamanho = 40 }: Props) {
  // Se a foto falhar ao carregar (URL expirada/sem rede), volta pro fallback
  // de iniciais em vez de deixar um espaço vazio.
  const [falhouAoCarregar, setFalhouAoCarregar] = useState(false);
  const estilo = useMemo(
    () => ({ width: tamanho, height: tamanho, borderRadius: tamanho / 2 }),
    [tamanho],
  );

  if (fotoUrl && !falhouAoCarregar) {
    return <Image source={{ uri: fotoUrl }} style={estilo} onError={() => setFalhouAoCarregar(true)} />;
  }

  return (
    <View style={[estilo, styles.fallback, { backgroundColor: corPorEmail(email) }]}>
      <Text style={[styles.iniciais, { fontSize: tamanho * 0.4 }]}>{iniciaisDoNome(nome)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iniciais: {
    fontFamily: fonts.bold,
    color: '#FFFFFF',
  },
});
