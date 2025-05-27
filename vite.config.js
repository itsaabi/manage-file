import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env': {}, // Fix "process is not defined" error in browser
  },

  root: '.', // Root directory
  
  publicDir: 'public', // Where rider.html and driver.html are
  
  build: {
    outDir: 'dist',
  },

  server: {
    port: 5501,  //5173
    //open: '/mainPage_index.html', //ipfs/QmQJQGcFw4w4vJB3wFrEBVbtGQ24gtaNWSNV8DAZ2zaEeh' // Correct way to auto-open IPFS page
  }
});