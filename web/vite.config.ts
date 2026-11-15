import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// relative base: the site works from any GitHub Pages sub-path (routing uses the URL hash)
export default defineConfig({ base: './', plugins: [react()], server: { port: 5173 } })
