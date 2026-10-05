import './polyfills' // PRIMEIRO de tudo: compat iOS antigo (ReadableStream async)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/instrument-sans'
import './index.css'
import App from './App.tsx'
import { ChatsProvider } from './ui/chats'
import { StudiesProvider } from './ui/studies'
import { SettingsProvider } from './ui/settings'
import { AuthProvider } from './ui/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ChatsProvider>
            <StudiesProvider>
              <App />
            </StudiesProvider>
          </ChatsProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
