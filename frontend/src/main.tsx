import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App'
import { AuthProvider } from './auth'
import { ConfirmHost } from './confirm'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <ConfirmHost />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: { background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--line-2)', borderRadius: 10, fontSize: 14, maxWidth: 420 },
            success: { iconTheme: { primary: 'var(--good)', secondary: 'var(--panel-2)' } },
            error: { duration: 5000, iconTheme: { primary: 'var(--bad)', secondary: 'var(--panel-2)' } },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
