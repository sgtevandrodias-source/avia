import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { RootNavigator } from './src/navigation';
import { navigationRef } from './src/navigation/navigationRef';
import { ItemsProvider } from './src/context/ItemsContext';
import { CategoriasProvider } from './src/context/CategoriasContext';
import { CompartilhamentosProvider } from './src/context/CompartilhamentosContext';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { useAviaFonts } from './src/theme/typography';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { configurarCanalAndroid, solicitarPermissaoNotificacoes } from './src/notifications/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Conteudo() {
  const { usuario, carregando } = useAuth();

  if (carregando) return null;

  return (
    <NavigationContainer ref={navigationRef}>
      {usuario ? (
        <CategoriasProvider>
          <CompartilhamentosProvider>
            <ItemsProvider>
              <RootNavigator />
            </ItemsProvider>
          </CompartilhamentosProvider>
        </CategoriasProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}

function BarraDeStatus() {
  const { esquemaAtivo } = useTheme();
  return <StatusBar style={esquemaAtivo === 'escuro' ? 'light' : 'dark'} />;
}

export default function App() {
  const [fontesCarregadas] = useAviaFonts();

  useEffect(() => {
    configurarCanalAndroid();
    solicitarPermissaoNotificacoes().catch(() => {});
  }, []);

  useEffect(() => {
    if (fontesCarregadas) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontesCarregadas]);

  // Nota: o tratamento de toque na notificação de compartilhamento mora
  // dentro de CompartilhamentosProvider (ver
  // src/context/CompartilhamentosContext.tsx), não aqui — precisa chamar o
  // recarregar() daquele contexto pra atualizar a tela na hora. Só chamar
  // sincronizar() sem isso deixava o convite visível somente depois de
  // fechar e abrir o app de novo, já que este componente fica fora da
  // árvore dos providers.

  if (!fontesCarregadas) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <Conteudo />
          </AuthProvider>
          <BarraDeStatus />
        </SafeAreaProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
