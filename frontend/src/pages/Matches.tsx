import { useSearchParams } from 'react-router-dom'
import { useApi } from '../api'
import { useAuth } from '../auth'
import type { MatchSummary } from '../types'
import { MatchList, SignInPrompt, Status } from '../ui'

const TABS = [
  { key: 'live', label: 'Live', path: '/matches?filter=live', empty: 'No match is being scored right now.' },
  { key: 'upcoming', label: 'Upcoming', path: '/matches?filter=upcoming', empty: 'Nothing scheduled.' },
  { key: 'results', label: 'Results', path: '/matches?filter=recent', empty: 'No results yet.' },
  { key: 'mine', label: 'All matches', path: '/me/matches', empty: 'No matches yet.' },
]

export default function Matches() {
  const { user, ready } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[1]
  const tabs = TABS
  const { data, error, loading } = useApi<MatchSummary[]>(user ? tab.path : null)
  return (
    <div className="page">
      <div className="page-head"><h1>{tab.key === 'live' ? 'Live Center' : 'Fixtures & results'}</h1></div>
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`tab ${t === tab ? 'active' : ''}`} onClick={() => setParams({ tab: t.key })}>{t.label}</button>
        ))}
      </div>
      {ready && !user && <SignInPrompt what="matches" />}
      <Status loading={loading} error={error} />
      {data && !loading && <div className="card flush"><MatchList matches={data} empty={tab.empty} /></div>}
    </div>
  )
}
