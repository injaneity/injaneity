import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-oxc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/react-router-dom')) {
            return 'react-vendor';
          }

          // Markdown rendering pipeline (react-markdown + remark/rehype + highlight.js)
          if (id.includes('react-markdown') ||
              id.includes('remark') ||
              id.includes('rehype') ||
              id.includes('micromark') ||
              id.includes('mdast') ||
              id.includes('hast') ||
              id.includes('highlight.js') ||
              id.includes('lowlight')) {
            return 'markdown-vendor';
          }

          // UI libraries
          if (id.includes('lucide-react') ||
              id.includes('zustand')) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
})
