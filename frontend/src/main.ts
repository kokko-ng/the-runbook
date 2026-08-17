import { createPinia } from 'pinia'
import { createApp } from 'vue'

// Self-hosted so the app has no third-party font dependency at runtime, and
// latin-only because the game ships in en-US to match the Azure docs it teaches.
import '@fontsource-variable/archivo/wght.css'
import '@fontsource/source-serif-4/latin-400.css'
import '@fontsource/source-serif-4/latin-600.css'
import '@fontsource/source-serif-4/latin-400-italic.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'

import App from './App.vue'
import { router } from './router'
import './styles/main.css'

createApp(App).use(createPinia()).use(router).mount('#app')
