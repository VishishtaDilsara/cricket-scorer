-- Admins and scorers. Every admin owns a separate space (org_id = the admin's own id); a scorer belongs to the
-- admin who created it (org_id = that admin's id). Teams, players, tournaments and matches belong to an admin.

alter table app_user add column username varchar(60);
alter table app_user add column role varchar(10) not null default 'ADMIN';
alter table app_user add column org_id uuid;
update app_user set org_id = id;
create unique index ux_app_user_username on app_user(username);
create index idx_app_user_org on app_user(org_id);

-- Players: owned by the admin who owns a team they play for.
alter table player add column owner_id uuid references app_user(id);
update player set owner_id = (
  select t.owner_id from team_player tp join team t on t.id = tp.team_id
  where tp.player_id = player.id and t.owner_id is not null
  order by t.created_at limit 1);
create index idx_player_owner on player(owner_id);

-- Matches: owned by the tournament's owner, otherwise by whoever created the match.
alter table cricket_match add column owner_id uuid references app_user(id);
update cricket_match set owner_id = coalesce(
  (select t.owner_id from tournament t where t.id = cricket_match.tournament_id), created_by);
create index idx_match_owner on cricket_match(owner_id);

create index idx_team_owner on team(owner_id);
create index idx_tournament_owner on tournament(owner_id);
