import { createNavigationContainerRef, DrawerActions } from '@react-navigation/native';

// Ponte pra abrir o drawer a partir de um componente que não é descendente do
// Drawer.Navigator (o TopBar compartilhado, renderizado uma única vez em
// navigation/index.tsx, acima da caixa de captura — ver melhoria de UI
// pedida). useNavigation() ali resolveria pro Stack (o pai do Drawer, não o
// Drawer em si), e dispatch de ações de navegador-filho não sobe pra
// navegadores ancestrais — só o ref preso no NavigationContainer consegue
// alcançar o navegador focado (o Drawer) de fora da árvore dele.
export const navigationRef = createNavigationContainerRef();

export function abrirDrawer(): void {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(DrawerActions.openDrawer());
  }
}

/** Mesmo raciocínio de abrirDrawer(): navega a partir de um componente fora da árvore do Stack. */
export function navegarPara(rota: string, params?: object): void {
  if (navigationRef.isReady()) {
    (navigationRef.navigate as (rota: string, params?: object) => void)(rota, params);
  }
}
