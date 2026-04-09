import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY),
      'process.env.SMTP_HOST': JSON.stringify(env.SMTP_HOST || process.env.SMTP_HOST),
      'process.env.SMTP_PORT': JSON.stringify(env.SMTP_PORT || process.env.SMTP_PORT),
      'process.env.SMTP_USER': JSON.stringify(env.SMTP_USER || process.env.SMTP_USER),
      'process.env.SMTP_PASS': JSON.stringify(env.SMTP_PASS || process.env.SMTP_PASS),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
