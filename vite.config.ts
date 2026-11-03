import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative paths, so the app works wherever it is served from — GitHub Pages
// serves it under the repository name (/Form-generator/), and that name's
// capitalisation must not matter. Override with BASE_PATH if ever needed.
const base = process.env.BASE_PATH ?? './'

// Shown in the app so it is easy to tell which version a phone is running.
const builtAt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date())

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? builtAt) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Vehicle Records',
        short_name: 'Vehicles',
        description: 'Sign vehicles in and out, export the daily sheet as PDF.',
        theme_color: '#1f3a5f',
        background_color: '#f4f5f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
  },
})
