import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path matches the GitHub Pages project URL: https://<user>.github.io/store-tracker/
// If you deploy to Firebase Hosting / Netlify / Vercel (root domain) instead,
// change this back to '/'.
export default defineConfig({
  plugins: [react()],
  base: '/store-tracker/',
});
