import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppTabsProvider } from './tabs/AppTabs'
import App from './App'
import { LocaleProvider } from './i18n/LocaleContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LocaleProvider><AppTabsProvider><App /></AppTabsProvider></LocaleProvider>
  </React.StrictMode>
)
