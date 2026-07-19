import { Alert, Platform } from 'react-native';

// Alert.alert no react-native-web é um no-op (função vazia) — nunca mostra
// nada e nunca chama os callbacks. No build web usamos window.confirm/alert.

export function confirmar(titulo: string, mensagem: string, aoConfirmar: () => void): void {
  if (Platform.OS === 'web') {
    if (window.confirm(`${titulo}\n\n${mensagem}`)) aoConfirmar();
    return;
  }
  Alert.alert(titulo, mensagem, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Confirmar', style: 'destructive', onPress: aoConfirmar },
  ]);
}

export function avisar(titulo: string, mensagem: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensagem}`);
    return;
  }
  Alert.alert(titulo, mensagem);
}
