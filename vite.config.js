import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path matches the GitHub Pages project URL: https://<user>.github.io/kyiv-1/
// If you deploy to Firebase Hosting / Netlify / Vercel (root domain) instead,
// change this back to '/'.
export default defineConfig({
  plugins: [react()],
  base: '/kyiv-1/',
});
