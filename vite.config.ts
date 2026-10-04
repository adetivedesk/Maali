import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './', // relative assets so the build works under /<repo>/ on GitHub Pages
  plugins: [react(), tailwindcss()],
})
