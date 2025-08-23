import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  server: {allowedHosts: ["mygateway"]},
  root: 'src',
  publicDir: "../public",
  base: '/dumbllmchat/',
  build: {
    outDir: '../dist'
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        mode: 'development',
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: 'Dumb LLM Chat',
        short_name: 'DumbLLMChat',
        description: 'A dumb LLM chat application.',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'images/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
