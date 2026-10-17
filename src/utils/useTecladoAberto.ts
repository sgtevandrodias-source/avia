import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Com o teclado aberto, a área segura de baixo (barra de gestos do iPhone /
// barra de navegação do Android) fica escondida atrás dele — um campo fixo no
// rodapé que continuasse reservando esse espaço deixaria uma faixa vazia
// entre ele e o teclado. "will" no iOS (acompanha a animação do teclado); no
// Android só existem os eventos "did".
export function useTecladoAberto(): boolean {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const eventoMostrar = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const eventoEsconder = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const assinaturaMostrar = Keyboard.addListener(eventoMostrar, () => setAberto(true));
    const assinaturaEsconder = Keyboard.addListener(eventoEsconder, () => setAberto(false));
    return () => {
      assinaturaMostrar.remove();
      assinaturaEsconder.remove();
    };
  }, []);
  return aberto;
}
