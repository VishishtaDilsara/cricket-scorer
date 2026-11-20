import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, CalendarDays, LayoutGrid, LogOut, Plus, Radio, Search, Shield, Trophy, UserCog, Users } from 'lucide-react'
import { useAuth } from './auth'
import { initials, Loader } from './ui'
import Overview from './pages/Overview'
import Matches from './pages/Matches'
import NewMatch from './pages/NewMatch'
import MatchPage from './pages/MatchPage'
import Scorer from './pages/Scorer'
import Tournaments from './pages/Tournaments'
import TournamentPage from './pages/TournamentPage'
import { PlayerPage, TeamPage, Teams } from './pages/Teams'
import { Login, SearchPage } from './pages/Misc'
import Scorers from './pages/Scorers'
import Players from './pages/Players'
import Docs from './pages/Docs'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/matches?tab=live', label: 'Live Center', icon: Radio, match: 'tab=live' },
  { to: '/matches', label: 'Fixtures', icon: CalendarDays },
  { to: '/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/teams', label: 'Teams', icon: Shield },
  { to: '/players', label: 'Players', icon: Users, sideOnly: true },
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
        {user?.admin && (
          <>
            <NavLink to="/scorers" className={({ isActive }) => `nav ${isActive ? 'active' : ''}`}><UserCog size={17} />Scorers</NavLink>
            <div className="side-sep" />
            <Link to="/matches/new" className="nav"><Plus size={17} />Start a match</Link>
          </>
        )}
        <NavLink to="/docs" className={({ isActive }) => `nav docs-link ${isActive ? 'active' : ''}`}><BookOpen size={17} />Docs</NavLink>
        <div className="side-foot">
          {user ? (
            <div className="user-chip">
              <span className="avatar">{initials(user.name)}</span>
              <div className="grow">
                <div className="truncate" style={{ fontWeight: 700, fontSize: 13 }}>{user.name}</div>
                <div className="small muted truncate">{user.admin ? 'Admin' : 'Scorer'}</div>
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
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search matches, teams, players…" aria-label="Search" />
            <span className="dim small hide-sm" style={{ padding: '2px 6px', background: 'var(--panel-2)', borderRadius: 5, fontSize: 10, fontWeight: 700 }}>⌘K</span>
          </form>
          <div className="grow" />
          {user ? (
            <span className="avatar hide-sm" title={user.name}>{initials(user.name)}</span>
          ) : (
            <Link to="/login" className="btn hide-sm">Sign in</Link>
          )}
          {user?.admin && <Link to="/matches/new" className="btn primary"><Plus size={16} />Start a match</Link>}
        </header>
        <Outlet />
      </div>
      <nav className="bottom-nav">
        {NAV.filter((n) => !('sideOnly' in n)).map((n) => (
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

/** Pages that write need an account; viewing a shared link never does. `admin` pages are for admins only. */
function Private({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <Loader />
  if (!user) return <Navigate to={loc.pathname === '/' && !loc.search ? '/login' : `/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  if (admin && !user.admin) return <div className="page"><div className="card empty">Only an admin can do this. Ask your admin.</div></div>
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/matches/:id/score" element={<Private><Scorer /></Private>} />
      <Route element={<Shell />}>
        <Route path="/" element={<Private><Overview /></Private>} />
        <Route path="/matches" element={<Private><Matches /></Private>} />
        <Route path="/matches/new" element={<Private admin><NewMatch /></Private>} />
        <Route path="/scorers" element={<Private admin><Scorers /></Private>} />
        <Route path="/matches/:id" element={<MatchPage />} />
        <Route path="/tournaments" element={<Private><Tournaments /></Private>} />
        <Route path="/tournaments/:id" element={<TournamentPage />} />
        <Route path="/teams" element={<Private><Teams /></Private>} />
        <Route path="/teams/:id" element={<TeamPage />} />
        <Route path="/players" element={<Private><Players /></Private>} />
        <Route path="/players/:id" element={<PlayerPage />} />
        <Route path="/search" element={<Private><SearchPage /></Private>} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<div className="page"><div className="empty">Page not found. <Link className="brand" to="/">Go to the overview</Link></div></div>} />
      </Route>
    </Routes>
  )
}
