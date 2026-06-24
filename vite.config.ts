import { defineConfig } from 'vite'
// 请先通过npm/yarn/pnpm安装@vitejs/plugin-react，例如执行npm install @vitejs/plugin-react --save-dev
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
})
