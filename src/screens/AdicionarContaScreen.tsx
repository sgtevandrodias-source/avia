import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { LoginScreen } from './LoginScreen';

// Mesma tela/lógica de login, só que empilhada como modal por cima da árvore
// já autenticada — ao entrar com sucesso, essa conta vira a ativa (ver
// salvar() em AuthContext.tsx) e o modal se fecha sozinho, revelando os
// dados da conta recém-adicionada por trás.
export function AdicionarContaScreen() {
  const navigation = useNavigation<any>();
  return <LoginScreen aoConcluir={() => navigation.goBack()} />;
}
