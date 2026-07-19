import { useEffect, useState } from 'react';

// Build web: os .ttf locais do @expo-google-fonts/inter falharam ao subir
// pro Cloudflare Pages (caminho com "@" no node_modules virou fallback de
// index.html, travando o carregamento de fonte pra sempre => tela branca
// permanente, já que o app só renderiza depois que a fonte "carrega").
// Solução: buscar a folha de estilo do Google Fonts em runtime e reescrever
// os nomes de família pra bater com os mesmos usados no app nativo.

const PESOS = [400, 500, 700, 800] as const;
const NOME_POR_PESO: Record<number, string> = {
  400: 'Inter_400Regular',
  500: 'Inter_500Medium',
  700: 'Inter_700Bold',
  800: 'Inter_800ExtraBold',
};

let promessaCarregamento: Promise<void> | null = null;

function carregarFontesWeb(): Promise<void> {
  if (!promessaCarregamento) {
    promessaCarregamento = fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${PESOS.join(';')}&display=swap`,
    )
      .then((resposta) => resposta.text())
      .then((css) => {
        const cssReescrito = css
          .split('@font-face')
          .slice(1)
          .map((bloco) => {
            const pesoMatch = bloco.match(/font-weight:\s*(\d+)/);
            const peso = pesoMatch ? parseInt(pesoMatch[1], 10) : 400;
            const nome = NOME_POR_PESO[peso];
            if (!nome) return '';
            return `@font-face${bloco}`.replace(/font-family:\s*'Inter'/, `font-family: '${nome}'`);
          })
          .join('\n');

        const style = document.createElement('style');
        style.textContent = cssReescrito;
        document.head.appendChild(style);
      });
  }
  return promessaCarregamento;
}

export function useAviaFonts(): [boolean] {
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    carregarFontesWeb()
      .catch(() => {})
      .finally(() => setCarregado(true));
  }, []);

  return [carregado];
}

export const fonts = {
  regular: NOME_POR_PESO[400],
  medium: NOME_POR_PESO[500],
  bold: NOME_POR_PESO[700],
  extraBold: NOME_POR_PESO[800],
} as const;
