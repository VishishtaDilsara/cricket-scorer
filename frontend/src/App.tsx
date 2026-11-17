import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, CircleHelp, LayoutGrid, LogOut, Plus, Radio, Search, Settings, Shield, Trophy } from 'lucide-react'
import { useAuth } from './auth'
import { initials } from './ui'
import Overview from './pages/Overview'
import Matches from './pages/Matches'
import NewMatch from './pages/NewMatch'
import MatchPage from './pages/MatchPage'
import Scorer from './pages/Scorer'
import Tournaments from './pages/Tournaments'
import TournamentPage from './pages/TournamentPage'
import { PlayerPage, TeamPage, Teams } from './pages/Teams'
import { Login, SearchPage } from './pages/Misc'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/matches?tab=live', label: 'Live Center', icon: Radio, match: 'tab=live' },
  { to: '/matches', label: 'Fixtures', icon: CalendarDays },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/teams', label: 'Teams', icon: Shield },
]

function Shell() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [q, setQ] = useState('')
  const search = (e: FormEvent) => { e.preventDefault(); if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`) }
  const active = (n: (typeof NAV)[number]) => {
    const [path] = n.to.split('?')
    const live = loc.search.includes('tab=live')
    if (n.match) return loc.pathname === path && live
    if (n.end) return loc.pathname === path
    return loc.pathname.startsWith(path) && !(path === '/matches' && live)
  }
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="logo"><span className="logo-mark"><Wickets /></span>Cricket Scorer</Link>
        {NAV.map((n) => (
          <NavLink key={n.label} to={n.to} className={() => `nav ${active(n) ? 'active' : ''}`}><n.icon size={17} />{n.label}</NavLink>
        ))}
        <div className="side-sep" />
        <Link to="/matches/new" className="nav"><Plus size={17} />Start a match</Link>
        <div className="side-foot">
          <div className="row" style={{ padding: '0 8px 10px', fontSize: 11, color: 'var(--dim)', gap: 6 }}>
            <span className="status-dot green" style={{ width: 6, height: 6 }} />
            <span>System online · 12 feeds</span>
          </div>
          {user ? (
            <div className="user-chip">
              <span className="avatar">{initials(user.name)}</span>
              <div className="grow">
                <div className="truncate" style={{ fontWeight: 700, fontSize: 13 }}>{user.name}</div>
                <div className="small muted truncate">Broadcast Admin</div>
              </div>
              <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
            </div>
          ) : (
            <Link to="/login" className="btn block">Sign in</Link>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <form className="search" onSubmit={search} role="search">
            <Search size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search matches, teams, content…" aria-label="Search" />
            <span className="dim small hide-sm" style={{ padding: '2px 6px', background: 'var(--panel-2)', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>⌘K</span>
          </form>
          <div className="grow" />
          <Link to="/matches?tab=live" className="on-air-pill">
            <span className="dot" />
            <span>ON AIR</span>
          </Link>
          <button className="icon-btn hide-sm" aria-label="Notifications" title="Notifications"><Bell size={16} /></button>
          <button className="icon-btn hide-sm" aria-label="Help" title="Help"><CircleHelp size={16} /></button>
          <button className="icon-btn hide-sm" aria-label="Settings" title="Settings"><Settings size={16} /></button>
          {user ? (
            <span className="avatar hide-sm" title={user.name}>{initials(user.name)}</span>
          ) : (
            <Link to="/login" className="btn hide-sm">Sign in</Link>
          )}
          <Link to="/matches/new" className="btn primary"><Plus size={16} />Publish content</Link>
        </header>
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <NavLink key={n.label} to={n.to} className={() => (active(n) ? 'active' : '')}><n.icon size={19} />{n.label.split(' ')[0]}</NavLink>
        ))}
      </nav>
    </div>
  )
}

function Wickets() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <rect x="1.5" y="1" width="2.4" height="12" rx="1.2" /><rect x="5.8" y="1" width="2.4" height="12" rx="1.2" /><rect x="10.1" y="1" width="2.4" height="12" rx="1.2" />
    </svg>
  )
}

/** Pages that write need an account; viewing never does. */
function Private({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <div className="empty">Loading…</div>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/matches/:id/score" element={<Private><Scorer /></Private>} />
      <Route element={<Shell />}>
        <Route path="/" element={<Overview />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/new" element={<Private><NewMatch /></Private>} />
        <Route path="/matches/:id" element={<MatchPage />} />
        <Route path="/tournaments" element={<Tournaments />} />
        <Route path="/tournaments/:id" element={<TournamentPage />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:id" element={<TeamPage />} />
        <Route path="/players/:id" element={<PlayerPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<div className="page"><div className="empty">Page not found. <Link className="brand" to="/">Go to the overview</Link></div></div>} />
      </Route>
    </Routes>
  )
}
