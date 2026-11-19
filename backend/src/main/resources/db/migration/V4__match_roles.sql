-- Captain, vice-captain (optional) and wicket-keeper for each side, chosen per match.
alter table cricket_match add column team_a_captain_id uuid;
alter table cricket_match add column team_a_vice_captain_id uuid;
alter table cricket_match add column team_a_keeper_id uuid;
alter table cricket_match add column team_b_captain_id uuid;
alter table cricket_match add column team_b_vice_captain_id uuid;
alter table cricket_match add column team_b_keeper_id uuid;
