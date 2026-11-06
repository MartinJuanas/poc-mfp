import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-') || id.includes('node_modules/redux') || id.includes('node_modules/@reduxjs') || id.includes('node_modules/react-redux')) return 'charts'; } } } } });
