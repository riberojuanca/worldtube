type NavigationIconName = 'home' | 'subscriptions' | 'history' | 'saved' | 'playlists' | 'music' | 'account'

const symbols: Record<NavigationIconName, JSX.Element> = {
  home: <>
    <path fillRule="evenodd" d="M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm0 3v10h14V7H5Z" />
    <path d="m10 9 5 3-5 3Z" />
  </>,
  subscriptions: <>
    <rect x="6" y="2" width="12" height="2" rx="1" opacity=".45" />
    <rect x="4" y="5" width="16" height="2" rx="1" opacity=".7" />
    <path fillRule="evenodd" d="M5 9h14a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm5 3v7l6-3.5-6-3.5Z" />
  </>,
  history: <>
    <path fillRule="evenodd" d="M12 2a10 10 0 1 1-9.6 12.8l2.9-.8A7 7 0 1 0 5.3 10H2.2A10 10 0 0 1 12 2Z" />
    <path d="M1 5v7h7ZM11 6h2v6.5l4 2-1 2-5-2.7Z" />
  </>,
  saved: <>
    <path fillRule="evenodd" d="M7 2h10a3 3 0 0 1 3 3v17l-8-4-8 4V5a3 3 0 0 1 3-3Zm0 3v12l5-2.5 5 2.5V5H7Z" />
    <path d="m10 7 5 3-5 3Z" opacity=".7" />
  </>,
  playlists: <>
    <rect x="2" y="4" width="3" height="3" rx="1" />
    <rect x="7" y="4" width="15" height="3" rx="1" />
    <rect x="2" y="10" width="3" height="3" rx="1" />
    <rect x="7" y="10" width="15" height="3" rx="1" opacity=".7" />
    <rect x="2" y="16" width="3" height="3" rx="1" />
    <rect x="7" y="16" width="6" height="3" rx="1" opacity=".45" />
    <path d="m17 15 6 3.5-6 3.5Z" />
  </>,
  music: <>
    <path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </>,
  account: <>
    <path fillRule="evenodd" d="M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm0 3v14h14V5H5Z" opacity=".65" />
    <circle cx="12" cy="9" r="3" />
    <path d="M7 17v-1a5 5 0 0 1 10 0v1Z" />
  </>
}

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
    {symbols[name]}
  </svg>
}
