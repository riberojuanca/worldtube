import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const router = createHashRouter(
  [
    {
      path: '*',
      element: <App />
    }
  ],
  {
    future: {
      v7_relativeSplatPath: true
    }
  }
)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} future={{ v7_startTransition: true }} />
  </React.StrictMode>
)
