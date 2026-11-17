create table app_user (
  id uuid primary key,
  email varchar(255) not null unique,
  name varchar(120) not null,
  password_hash varchar(100) not null,
  is_admin boolean not null default false,
  created_at timestamp with time zone not null
);

create table team (
  id uuid primary key,
  name varchar(120) not null,
  short_name varchar(4),
  home_ground varchar(120),
  owner_id uuid references app_user(id),
  created_at timestamp with time zone not null
);

create table player (
  id uuid primary key,
  name varchar(120) not null,
  batting_hand varchar(10),
  bowling_style varchar(40),
  player_role varchar(20),
  user_id uuid references app_user(id),
  created_at timestamp with time zone not null
);

create table team_player (
  id uuid primary key,
  team_id uuid not null references team(id) on delete cascade,
  player_id uuid not null references player(id) on delete cascade,
  unique (team_id, player_id)
);

create table tournament (
  id uuid primary key,
  name varchar(160) not null,
  structure varchar(20) not null,
  double_round boolean not null default false,
  start_date date,
  end_date date,
  venue varchar(160),
  ball_type varchar(20),
  overs integer not null,
  players_per_side integer not null,
  balls_per_over integer not null,
  points_win integer not null,
  points_loss integer not null,
  points_tie integer not null,
  points_nr integer not null,
  qualify_per_group integer not null,
  status varchar(20) not null,
  owner_id uuid not null references app_user(id),
  created_at timestamp with time zone not null
);

create table tournament_team (
  id uuid primary key,
  tournament_id uuid not null references tournament(id) on delete cascade,
  team_id uuid not null references team(id),
  group_name varchar(20),
  unique (tournament_id, team_id)
);

create table cricket_match (
  id uuid primary key,
  tournament_id uuid references tournament(id) on delete cascade,
  stage varchar(20),
  group_name varchar(20),
  code varchar(20),
  label varchar(60),
  source_a varchar(60),
  source_b varchar(60),
  sort_order integer not null default 0,
  team_a_id uuid references team(id),
  team_b_id uuid references team(id),
  scheduled_at timestamp with time zone,
  ground varchar(160),
  format varchar(30),
  overs integer not null,
  players_per_side integer not null,
  balls_per_over integer not null,
  max_overs_per_bowler integer not null default 0,
  wide_runs integer not null default 1,
  no_ball_runs integer not null default 1,
  free_hit boolean not null default false,
  last_man_stands boolean not null default false,
  toss_winner_id uuid,
  toss_decision varchar(10),
  state varchar(20) not null,
  result_type varchar(20),
  winner_id uuid,
  result_text varchar(200),
  override_reason varchar(300),
  listed boolean not null default true,
  practice boolean not null default false,
  created_by uuid references app_user(id),
  lock_device varchar(80),
  completed_at timestamp with time zone,
  created_at timestamp with time zone not null
);
create index idx_match_tournament on cricket_match(tournament_id);
create index idx_match_state on cricket_match(state);

create table match_scorer (
  id uuid primary key,
  match_id uuid not null references cricket_match(id) on delete cascade,
  user_id uuid not null references app_user(id),
  unique (match_id, user_id)
);

create table innings (
  id uuid primary key,
  match_id uuid not null references cricket_match(id) on delete cascade,
  innings_no integer not null,
  batting_team_id uuid not null,
  bowling_team_id uuid not null,
  target integer,
  revised_overs integer,
  target_revised boolean not null default false,
  striker_id uuid,
  non_striker_id uuid,
  bowler_id uuid,
  runs integer not null default 0,
  wickets integer not null default 0,
  legal_balls integer not null default 0,
  closed boolean not null default false,
  end_reason varchar(30),
  unique (match_id, innings_no)
);

create table ball (
  id uuid primary key,
  innings_id uuid not null references innings(id) on delete cascade,
  seq integer not null,
  striker_id uuid not null,
  non_striker_id uuid,
  bowler_id uuid not null,
  runs_bat integer not null default 0,
  extra_type varchar(10) not null,
  extra_runs integer not null default 0,
  sub_extra varchar(10),
  dismissal varchar(20),
  dismissed_id uuid,
  fielder_id uuid,
  shot_zone integer,
  created_at timestamp with time zone not null
);
create index idx_ball_innings on ball(innings_id, seq);
create index idx_ball_striker on ball(striker_id);
create index idx_ball_bowler on ball(bowler_id);

create table table_adjustment (
  id uuid primary key,
  tournament_id uuid not null references tournament(id) on delete cascade,
  team_id uuid not null references team(id),
  points_delta integer not null,
  reason varchar(300) not null,
  created_by uuid references app_user(id),
  created_at timestamp with time zone not null
);

create table audit_entry (
  id uuid primary key,
  user_id uuid,
  entity varchar(40) not null,
  entity_id uuid,
  action varchar(40) not null,
  old_value varchar(1000),
  new_value varchar(1000),
  created_at timestamp with time zone not null
);
