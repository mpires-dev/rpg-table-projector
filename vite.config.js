import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// HTTPS é obrigatório para getUserMedia fora de localhost — ou seja, sempre
// que você abrir isso no celular. O basicSsl gera um certificado self-signed;
// o navegador vai reclamar uma vez e você aceita.
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true, // expõe na rede local (0.0.0.0) para o celular alcançar
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        ar: resolve(rootDir, 'ar.html'),
        markers: resolve(rootDir, 'markers.html'),
        projector: resolve(rootDir, 'projector.html'),
      },
    },
  },
});
