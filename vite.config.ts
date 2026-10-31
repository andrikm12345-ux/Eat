/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const THEME_LIGHT = '#f6f5f2';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Дневник',
        short_name: 'Дневник',
        description: 'Личный дневник питания и веса',
        lang: 'ru',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: THEME_LIGHT,
        theme_color: THEME_LIGHT,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Добавить еду',
            short_name: 'Еда',
            url: '/?action=add',
            icons: [{ src: '/icons/shortcut-add-96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Вес',
            short_name: 'Вес',
            url: '/?action=weigh',
            icons: [{ src: '/icons/shortcut-weight-96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Сканер',
            short_name: 'Сканер',
            url: '/?action=scan',
            icons: [{ src: '/icons/shortcut-scan-96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,json}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve:
    mode === 'test'
      ? {
          alias: {
            'virtual:pwa-register/react': fileURLToPath(
              new URL('./src/test/pwaRegisterStub.ts', import.meta.url),
            ),
          },
        }
      : undefined,
  build: { target: 'es2022', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.{ts,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/domain/types.ts'],
      // Pure domain logic must stay fully covered.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
}));
