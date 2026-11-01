/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const THEME_LIGHT = '#f4f5f2';

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(
      `${process.env.npm_package_version ?? '0.0.0'}+${new Date().toISOString().slice(0, 10)}${
        process.env.VERCEL_GIT_COMMIT_SHA ? `.${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : ''
      }`,
    ),
  },
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
        globIgnores: ['splash/**'],
        navigateFallback: '/index.html',
        importScripts: ['sw-update.js'],
        cleanupOutdatedCaches: true,
        // A new version activates immediately (an old cached shell must never linger);
        // the page then offers a reload via the update banner (see UpdateBanner).
        clientsClaim: true,
        skipWaiting: true,
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
    setupFiles: ['./test-setup/node-blob.js', './src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'scripts/**/*.test.{ts,mjs}'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      exclude: ['**/*.test.ts', 'src/domain/types.ts'],
      // Pure domain logic must stay fully covered.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
}));
