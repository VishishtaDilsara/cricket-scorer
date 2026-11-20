-- The playing XI for each side of a match, picked from the team's (possibly larger) squad before the toss.
create table match_player (
  id uuid primary key,
  match_id uuid not null references cricket_match(id) on delete cascade,
  team_id uuid not null,
  player_id uuid not null
);
create index match_player_match on match_player (match_id);
