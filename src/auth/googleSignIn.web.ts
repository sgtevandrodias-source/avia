// Build web: @react-native-google-signin/google-signin depende de módulo
// nativo. Login com Google só está disponível no app instalado (Android).
export function googleDisponivel(): boolean {
  return false;
}

export async function loginComGoogleNativo(): Promise<string | null> {
  throw new Error('Login com Google só está disponível no app instalado.');
}
