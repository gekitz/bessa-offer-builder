import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/auth.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import './index.css'

const isAcceptFlow = new URLSearchParams(window.location.search).has('a');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      {isAcceptFlow ? (
        <App />
      ) : (
        <ProtectedRoute>
          <App />
        </ProtectedRoute>
      )}
    </AuthProvider>
  </React.StrictMode>,
)
