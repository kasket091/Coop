import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build works from any static host path (e.g. GitHub Pages /Coop/)
export default defineConfig({ plugins: [react()], base: './' })
