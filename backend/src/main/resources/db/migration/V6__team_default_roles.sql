-- A team's usual captain, vice-captain and wicket-keeper, used for a match unless changed for that match.
alter table team add column captain_id uuid;
alter table team add column vice_captain_id uuid;
alter table team add column keeper_id uuid;
-- Whether a match's roles were chosen for that match (otherwise the team's defaults apply).
alter table cricket_match add column team_a_roles_set boolean not null default false;
alter table cricket_match add column team_b_roles_set boolean not null default false;
update cricket_match set team_a_roles_set = true where team_a_captain_id is not null or team_a_keeper_id is not null;
update cricket_match set team_b_roles_set = true where team_b_captain_id is not null or team_b_keeper_id is not null;
