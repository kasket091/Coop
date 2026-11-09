import { createRoot } from 'react-dom/client'
// Self-hosted so money figures keep their face on slow data, with no third-party font host (latin subset only).
import '@fontsource/anton/latin-400.css'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-600.css'
import '@fontsource/montserrat/latin-700.css'
import App from './App'
import { registerServiceWorker } from './pwa'
import './styles.css'

createRoot(document.getElementById('root')!).render(<App />)
registerServiceWorker()
