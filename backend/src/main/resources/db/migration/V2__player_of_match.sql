-- Player of the match picked by a match manager. Null = the app suggests one from the scorecard.
alter table cricket_match add column player_of_match_id uuid;
