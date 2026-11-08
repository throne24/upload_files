import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径，保证部署到 GitHub Pages 的任意子路径下都能正确加载资源
  base: './',
})
