/// <reference types="vitest/config" />
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Tailwind CSS v4 (plugin oficial pro Vite)
    tailwindcss(),
    // Transforma o site em "aplicativo" instalavel (PWA)
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Astrodny',
        short_name: 'Astrodny',
        description: 'Seu assistente academico pessoal para universitarios.',
        theme_color: '#0a0d1f',
        background_color: '#0a0d1f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    // host: true expoe o servidor na rede local ->
    // permite abrir o app no celular pelo IP do PC (mesma Wi-Fi)
    host: true,
  },
  test: {
    // configuracao do Vitest (testes)
    globals: true,
    // .worktrees tem checkouts PARALELOS do mesmo repo (ver superpowers:using-git-worktrees)
    // — sem isso, o Vitest varre os testes de lá TAMBEM e conta tudo em dobro.
    exclude: [...configDefaults.exclude, '.worktrees/**'],
  },
})
