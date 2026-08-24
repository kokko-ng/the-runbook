import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import { useUiStore } from './stores/ui'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
useUiStore().restoreTheme()
app.mount('#app')
