export type TeamRef = { id: string; name: string; shortName: string | null }
export type PlayerRef = { id: string; name: string }
export type TeamFull = TeamRef & { players: PlayerRef[] }
export type Score = { teamId: string; runs: number; wickets: number; overs: string }

export type MatchState = 'SCHEDULED' | 'LIVE' | 'INNINGS_BREAK' | 'COMPLETED' | 'ABANDONED' | 'CANCELLED'
export type MatchSummary = {
  id: string; tournamentId: string | null; tournamentName: string | null; stage: string | null; groupName: string | null
  code: string | null; label: string | null; sourceA: string | null; sourceB: string | null
  teamA: TeamRef | null; teamB: TeamRef | null; scheduledAt: string | null; ground: string | null; format: string | null
  overs: number; state: MatchState; resultType: string | null; winnerId: string | null; resultText: string | null; scores: Score[]
}

export type ExtraType = 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE' | 'PENALTY'
export type Dismissal =
  | 'BOWLED' | 'CAUGHT' | 'CAUGHT_AND_BOWLED' | 'LBW' | 'RUN_OUT' | 'STUMPED' | 'HIT_WICKET'
  | 'RETIRED_OUT' | 'OBSTRUCTING_FIELD' | 'TIMED_OUT' | 'HIT_BALL_TWICE' | 'RETIRED_HURT'

export type Ball = {
  id: string; strikerId: string; nonStrikerId: string | null; bowlerId: string
  runsBat: number; extraType: ExtraType; extraRuns: number; subExtra: ExtraType | null
  dismissal: Dismissal | null; dismissedId: string | null; fielderId: string | null
}
export type BallInput = Partial<Omit<Ball, 'id' | 'strikerId' | 'nonStrikerId' | 'bowlerId'>>

export type Rules = {
  overs: number; ballsPerOver: number; playersPerSide: number; maxOversPerBowler: number
  wideRuns: number; noBallRuns: number; freeHit: boolean; lastManStands: boolean
}

export type Batter = {
  playerId: string; name: string; runs: number; balls: number; fours: number; sixes: number
  dismissal: Dismissal | null; bowlerId: string | null; fielderId: string | null; howOut: string
}
export type Bowler = { playerId: string; name: string; balls: number; maidens: number; runs: number; wickets: number; wides: number; noBalls: number }
export type Fow = { wicket: number; score: number; playerId: string; name: string; over: string }
export type Partnership = { batterA: string; batterB: string | null; nameA: string; nameB: string; runs: number; balls: number }
export type Over = { number: number; bowlerId: string; bowlerName: string; runs: number; wickets: number; balls: string[] }
export type InningsState = {
  runs: number; wickets: number; legalBalls: number
  wides: number; noBalls: number; byes: number; legByes: number; penalties: number
  oversText: string; batters: Batter[]; bowlers: Bowler[]; fow: Fow[]; partnerships: Partnership[]; overs: Over[]
  freeHitNext: boolean; complete: boolean; allOut: boolean; overComplete: boolean
  nextStriker: string | null; nextNonStriker: string | null; lastOverBowler: string | null
}
export type InningsView = {
  no: number; battingTeamId: string; bowlingTeamId: string; target: number | null; revisedOvers: number | null
  closed: boolean; strikerId: string | null; nonStrikerId: string | null; bowlerId: string | null
  state: InningsState; balls: Ball[] | null
}
export type MatchView = {
  summary: MatchSummary; rules: Rules; teamA: TeamFull | null; teamB: TeamFull | null
  tossWinnerId: string | null; tossDecision: string | null; listed: boolean; practice: boolean
  overrideReason: string | null; playerOfMatchId: string | null; canScore: boolean; canManage: boolean; innings: InningsView[]
}

export type Tournament = {
  id: string; name: string; structure: 'LEAGUE' | 'GROUPS_KNOCKOUT' | 'KNOCKOUT'; venue: string | null; ballType: string | null
  status: string; doubleRound: boolean; startDate: string | null; endDate: string | null
  overs: number; playersPerSide: number; ballsPerOver: number
  pointsWin: number; pointsLoss: number; pointsTie: number; pointsNr: number; qualifyPerGroup: number
}
export type TableRow = {
  teamId: string; name: string; shortName: string | null; played: number; won: number; lost: number; tied: number
  noResult: number; points: number; nrr: number; adjustment: number; mark: 'Q' | 'E' | null
}
export type GroupTable = { group: string; complete: boolean; rows: TableRow[] }
export type TournamentView = {
  tournament: Tournament; canManage: boolean; teams: { team: TeamRef; groupName: string | null }[]
  fixtures: MatchSummary[]; tables: GroupTable[]
  adjustments: { id: string; teamId: string; teamName: string; pointsDelta: number; reason: string; createdAt: string }[]
}
export type TournamentCard = {
  id: string; name: string; structure: string; status: string; startDate: string | null; endDate: string | null
  venue: string | null; teams: number
}
export type Board = { key: string; title: string; entries: { playerId: string; name: string; value: string; detail: string }[] }

export type Player = { id: string; name: string; battingHand: string | null; bowlingStyle: string | null; playerRole: string | null }
export type Career = {
  matches: number; innings: number; notOuts: number; runs: number; balls: number; highestScore: string | null
  average: number | null; strikeRate: number | null; thirties: number; fifties: number; hundreds: number; fours: number; sixes: number
  bowlBalls: number; maidens: number; conceded: number; wickets: number; best: string | null
  bowlingAverage: number | null; economy: number | null; bowlingStrikeRate: number | null
  catches: number; runOuts: number; stumpings: number
}
export type Overview = {
  counts: { live: number; completed: number; tournaments: number; teams: number; players: number; balls: number }
  featured: MatchView | null; live: MatchSummary[]; upcoming: MatchSummary[]; recent: MatchSummary[]
  tournament: TournamentView | null
}
export type User = { id: string; email: string; name: string; username: string | null; role: 'ADMIN' | 'SCORER'; admin: boolean }
export type ScorerAccount = User
