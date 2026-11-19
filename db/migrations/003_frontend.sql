-- Bookmarks, uploaded images, invites and onboarding.

create table bookmarks (
  post_id    bigint not null references posts(id) on delete cascade,
  user_id    bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- Uploaded images. The bytes live in object storage (or the upload directory); only the key is stored here.
create table media (
  id         text primary key,
  user_id    bigint not null references users(id),
  mime       text not null,
  bytes      int not null,
  width      int,
  height     int,
  created_at timestamptz not null default now()
);
create index media_user on media (user_id, created_at desc);

alter table posts add column media_ids text[] not null default '{}';

-- Who joined through whose link (invited_by already exists on users).
create unique index invites_inviter on invites (inviter_id);

-- Set once the person has picked a handle and finished the welcome steps.
alter table users add column onboarded_at timestamptz;
update users set onboarded_at = created_at where handle is not null;

-- One watchlist per person for now (the table allows room watchlists later).
create unique index watchlists_owner_personal on watchlists (owner_id) where room_id is null;
