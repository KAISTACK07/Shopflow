import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import './index.css'
import { applyTheme, storedTheme } from './lib/theme'
import { AuthProvider } from './state/AuthProvider'
import { CartProvider } from './state/CartProvider'
import { WishlistProvider } from './state/WishlistProvider'

// Apply a saved light/dark choice before the first paint (no saved choice = follow the operating system).
applyTheme(storedTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <App />
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
