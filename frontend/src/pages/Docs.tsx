import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** The user guide: everything the site can do, for admins, scorers and people following a shared link. */
export default function Docs() {
  return (
    <div className="page docs">
      <div className="page-head">
        <div>
          <h1>Docs</h1>
          <div className="muted small">Everything Cricket Scorer can do, and how to do it.</div>
        </div>
      </div>
      <div className="docs-layout">
        <nav className="docs-toc card" aria-label="Contents">
          <div className="small dim docs-toc-title">Contents</div>
          {SECTIONS.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}
        </nav>
        <article className="docs-body">
          <Section id="start" title="Getting started">
            <p>Cricket Scorer runs a whole competition from your phone: teams and players, ball-by-ball scoring, live scorecards anyone can follow, tournaments with points tables and brackets, and statistics for every player.</p>
            <h3>Three kinds of people use it</h3>
            <table className="table docs-table">
              <thead><tr><th className="left">Who</th><th className="left">What they can do</th></tr></thead>
              <tbody>
                <tr><td className="left strong">Admin</td><td className="left">Creates and deletes teams, players, matches and tournaments. Creates scorer accounts. Scores matches. Sees everything in their own space.</td></tr>
                <tr><td className="left strong">Scorer</td><td className="left">Created by an admin. Scores any match in that admin's space, picks the playing XI and roles before the toss, and downloads reports. Cannot create or delete anything.</td></tr>
                <tr><td className="left strong">Anyone with a link</td><td className="left">Opens a shared match, tournament, team or player link and follows it live. No account needed.</td></tr>
              </tbody>
            </table>
            <h3>Create an admin account</h3>
            <ol>
              <li>Open the site and choose <b>New admin? Create an account</b> on the sign-in page.</li>
              <li>Enter your name, email and a password of 8 characters or more.</li>
            </ol>
            <p>You get your own private space. Teams, players, matches and tournaments made by another admin never appear in yours, and yours never appear in theirs.</p>
            <h3>Sign in</h3>
            <p>Admins and scorers sign in on the same page with their <b>email or username</b> and password. Opening the site while signed out takes you to the sign-in page; shared links open without signing in.</p>
          </Section>

          <Section id="scorers" title="Scorer accounts">
            <p>Admins open <b>Scorers</b> in the sidebar.</p>
            <ul>
              <li><b>New scorer</b>: enter an email, a username (letters, numbers, dot, dash or underscore) and a password. Give the scorer their username and password; they sign in with either the username or the email.</li>
              <li><b>Reset password</b>: sets a new password for a scorer who forgot theirs.</li>
              <li><b>Delete</b>: the scorer is signed out at once and can no longer score.</li>
            </ul>
          </Section>

          <Section id="teams" title="Teams and players">
            <h3>Teams</h3>
            <p>Admins create a team from <b>Teams → New team</b> with a name, an optional short name (up to 4 letters, shown on badges) and a home ground. Teams are also created for you when you name a new team while starting a match or setting up a tournament.</p>
            <p>A team page shows its record (played, won, lost, tied or no result), its squad and its matches.</p>
            <h3>Squad</h3>
            <ul>
              <li>Add any number of players. A name is enough; role, batting hand and bowling style are optional.</li>
              <li><b>Usual captain, vice-captain and wicket-keeper</b>: tap <b>C</b>, <b>VC</b> or <b>WK</b> next to a player. Every new match starts with these roles. The vice-captain is optional, and the captain cannot also be vice-captain.</li>
              <li><b>Remove</b> takes a player out of the team. Their past scores stay in the records.</li>
            </ul>
            <h3>Players page</h3>
            <p><b>Players</b> lists everyone in your space grouped by team, with a filter box. Players who are in no team appear under <b>Not in a team</b>.</p>
            <h3>Player profile</h3>
            <ul>
              <li>Career batting, bowling and fielding figures: runs, average, strike rate, 30s/50s/100s, wickets, best figures, economy, catches, run outs and stumpings.</li>
              <li>Charts: <b>runs per innings</b> with the batting average line, <b>wickets per match</b>, <b>how the runs came</b> (singles to sixes, dot-ball and boundary percentages) and <b>how they got out</b>. Hover or tap a column for the details of that match.</li>
              <li><b>Match by match</b> table of every game.</li>
              <li><b>PDF report</b> (admins and scorers): the figures, the charts and the match log in one file.</li>
            </ul>
            <p>Practice matches are left out of career figures.</p>
          </Section>

          <Section id="matches" title="Starting a match">
            <p>Admins choose <b>Start a match</b>.</p>
            <ul>
              <li>For each side, switch between <b>Existing</b> (pick one of your teams) and <b>New</b> (type a name to create a team).</li>
              <li>Pick a <b>format</b> (T20, T10, 50 overs, The Hundred or Custom) or set the overs yourself.</li>
              <li><b>Show match rules and schedule</b> for more: players per side, balls per over, maximum overs per bowler, runs for a wide or no-ball, free hit after a no-ball, last man stands, ground, date and time, whether the match is public, and whether it is a practice match.</li>
            </ul>
            <p><b>Create and start scoring</b> opens the scoring screen; <b>Save as a fixture</b> keeps it for later. <b>Fixtures</b> lists your matches and <b>Live Center</b> shows the ones in progress.</p>
          </Section>

          <Section id="toss" title="Before the toss">
            <p>Open a match and choose <b>Start scoring</b>. Each team gets a card:</p>
            <ul>
              <li><b>Playing XI</b>: tick the players who play. The number is the match's players per side (set by the tournament for tournament matches). A squad that is exactly the right size is ticked for you.</li>
              <li><b>Roles</b>: the team's usual captain, vice-captain and keeper are filled in. Use the <b>⇄ swap button</b> to change them for this match only. If a usual captain or keeper is not playing, pick someone else.</li>
              <li>Admins can add missing players to the squad here; they are kept for future matches.</li>
            </ul>
            <p>Then record the <b>toss</b> (there is a <b>Flip a coin</b> button), choose bat or bowl, and press <b>Start match</b>. A checklist above the button says what is still missing. The XI and roles are locked once the match starts.</p>
          </Section>

          <Section id="scoring" title="Scoring a match">
            <p>The scoring screen is built for one thumb on a phone at the ground.</p>
            <ul>
              <li>Choose the striker, non-striker and bowler when asked. Only the playing XI can be picked.</li>
              <li>Tap <b>0–4</b> or <b>6</b> for runs off the bat; <b>5, 7+</b> for rarer counts.</li>
              <li>For extras, first tap <b>Wide</b>, <b>No ball</b>, <b>Bye</b> or <b>Leg bye</b>, then the runs.</li>
              <li><b>WICKET</b> asks how the batter was out, offering only the dismissals possible on that ball, and the fielder where needed.</li>
              <li><b>Swap</b> changes the striker; <b>Undo</b> removes the last ball.</li>
              <li><b>More</b>: edit an earlier ball, end the innings early, reduce the overs or revise the target after rain, or abandon the match or set the result.</li>
            </ul>
            <p>Strike rotation, over changes, free hits, the bowler's over limit and the result are all worked out for you.</p>
            <h3>Works without signal</h3>
            <p>Every ball is saved on the phone first and sent when there is a connection. The pill at the top shows whether everything is synced. Nothing is ever recorded twice.</p>
            <h3>One phone at a time</h3>
            <p>Only one device scores a match at once. Another device sees a read-only screen with <b>Take over scoring</b>.</p>
            <h3>Sunlight mode</h3>
            <p>The sun button switches to dark text on white for reading outdoors.</p>
          </Section>

          <Section id="match-page" title="Match page">
            <ul>
              <li><b>Summary</b>: batters at the crease, the current bowler, the last six balls, run rates and what is needed in a chase. Updates live, by itself.</li>
              <li><b>Scorecard</b>: full batting and bowling cards, extras, fall of wickets and partnerships. Captains are marked (c), vice-captains (vc) and keepers (wk).</li>
              <li><b>Ball by ball</b>: every over.</li>
              <li><b>Playing XI</b> for both sides, and the <b>player of the match</b> once it ends: picked automatically from the scorecard, or chosen by an admin.</li>
              <li><b>PDF report</b> (admins and scorers): the whole match on paper.</li>
              <li><b>Manage</b> (admins): change the date and ground, record or override a result with a reason, choose the player of the match, or delete the match.</li>
            </ul>
          </Section>

          <Section id="tournaments" title="Tournaments">
            <p>Admins choose <b>Tournaments → New tournament</b> and pick a structure:</p>
            <ul>
              <li><b>Round-robin league</b>: everyone plays everyone (or twice, home and away).</li>
              <li><b>Groups then knockouts</b>: group matches, then the top teams of each group go into a bracket.</li>
              <li><b>Straight knockout</b>.</li>
            </ul>
            <h3>Organiser tab</h3>
            <ol>
              <li><b>Settings</b>: overs, players per side, balls per over, points for a win, loss, tie and no result, how many qualify from each group, dates and venue.</li>
              <li><b>Teams</b>: add your existing teams (tick several and press Add) or create new ones, then place them in groups or run a random draw.</li>
              <li><b>Fixtures</b>: one button generates the whole schedule, including knockout matches that fill in as results come in.</li>
            </ol>
            <p>Admins can also <b>adjust the points table</b> with a public reason (for example a slow over rate), and delete the tournament.</p>
            <h3>Tabs everyone can see</h3>
            <ul>
              <li><b>Fixtures</b> and <b>Teams</b>.</li>
              <li><b>Points table</b>: level teams are split by wins, then net run rate, then head-to-head. Qualified teams are marked Q and eliminated teams E once a group is complete.</li>
              <li><b>Bracket</b>: the group stage and every knockout round, with arrows showing where each team comes from.</li>
              <li><b>Leaderboards</b>: most runs, most wickets, best strike rate, best economy, most sixes, most catches and most valuable player.</li>
              <li><b>Summary</b>, once the tournament is decided: see below.</li>
            </ul>
          </Section>

          <Section id="awards" title="Tournament summary and awards">
            <table className="table docs-table">
              <thead><tr><th className="left">Award</th><th className="left">How it is decided</th></tr></thead>
              <tbody>
                <tr><td className="left strong">Champions</td><td className="left">Winner of the final (in a league with no final, top of the table).</td></tr>
                <tr><td className="left strong">1st runners-up</td><td className="left">Loser of the final (or second on the table).</td></tr>
                <tr><td className="left strong">2nd runners-up</td><td className="left">The losing semi-finalist with the better group-stage record, or the better net run rate in a straight knockout (or third on the table).</td></tr>
                <tr><td className="left strong">Player of the series</td><td className="left">Highest impact score: runs, plus 20 for each wicket, plus 10 for each catch, run out or stumping.</td></tr>
                <tr><td className="left strong">Best batter</td><td className="left">Most runs; level on runs, the higher strike rate.</td></tr>
                <tr><td className="left strong">Best bowler</td><td className="left">Most wickets; level on wickets, the lower economy; then fewer runs conceded.</td></tr>
              </tbody>
            </table>
            <p>The summary also shows matches played, fours, sixes, the highest score and the best bowling figures.</p>
          </Section>

          <Section id="sharing" title="Sharing with your audience">
            <p>Press <b>Share</b> on any match, tournament, team or player to send the link, or copy it. Anyone who opens it sees the live page without an account. Lists of your teams, matches and tournaments stay private to you and your scorers.</p>
          </Section>

          <Section id="faq" title="Questions">
            <dl className="docs-faq">
              <dt>A scorer cannot find a player.</dt>
              <dd>Only admins add players. Ask your admin to add them to the team; before the toss they then appear in the squad list.</dd>
              <dt>The wrong ball was recorded.</dt>
              <dd>Use <b>Undo</b> for the last ball, or <b>More → Edit an earlier ball</b> for any other.</dd>
              <dt>Rain stopped play.</dt>
              <dd>Use <b>More → Reduce overs / revise target</b>, or <b>Abandon match or set the result</b> if it cannot finish.</dd>
              <dt>A team plays short on the day.</dt>
              <dd>An admin lowers the players per side for that match before the toss.</dd>
              <dt>Can I score on two phones?</dt>
              <dd>One at a time. Press <b>Take over scoring</b> on the second phone to move scoring to it.</dd>
            </dl>
            <p className="muted small">Ready to begin? <Link className="brand" to="/login">Sign in or create an admin account</Link>.</p>
          </Section>
        </article>
      </div>
    </div>
  )
}

const SECTIONS: [string, string][] = [
  ['start', 'Getting started'], ['scorers', 'Scorer accounts'], ['teams', 'Teams and players'], ['matches', 'Starting a match'],
  ['toss', 'Before the toss'], ['scoring', 'Scoring a match'], ['match-page', 'Match page'], ['tournaments', 'Tournaments'],
  ['awards', 'Summary and awards'], ['sharing', 'Sharing'], ['faq', 'Questions'],
]

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="card docs-section"><h2>{title}</h2>{children}</section>
}
