-- Referral waitlist (pre-launch growth engine). A referral counts only once the invitee is verified:
-- signed in with X, a checked follow of the project account, and the anti-sybil checks.

alter table users
  add column x_user_id          text unique,
  add column x_followers        int,
  add column x_created_at       timestamptz,
  add column follow_state       text not null default 'none' check (follow_state in ('none', 'pending', 'verified')),
  add column verified_at        timestamptz,
  add column founder_no         int unique,
  add column waitlist_joined_at timestamptz,
  add column signup_ip_hash     text;

-- One primary code per member.
create table referral_codes (
  code       text primary key check (code ~ '^[a-z0-9]{6,12}$'),
  user_id    bigint not null unique references users(id),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Carry over codes made on the invite page.
insert into referral_codes (code, user_id, created_at)
select code, inviter_id, created_at from invites where code ~ '^[a-z0-9]{6,12}$'
on conflict do nothing;

create table referrals (
  id           bigserial primary key,
  referrer_id  bigint not null references users(id),
  invitee_id   bigint not null unique references users(id),
  code         text not null,
  state        text not null default 'signed_up' check (state in ('signed_up', 'verified', 'rejected')),
  signed_up_at timestamptz not null default now(),
  verified_at  timestamptz,
  note         text,
  check (referrer_id <> invitee_id)
);
create index referrals_referrer on referrals (referrer_id, state);

-- Append-only: everything that moves a rank. The leaderboard is computed from these, never from client numbers.
create table points_events (
  id         bigserial primary key,
  user_id    bigint not null references users(id),
  kind       text not null check (kind in ('verified_invite', 'review_hold', 'review_clear', 'perk_granted')),
  points     int not null default 0,
  ref_id     bigint,
  note       text,
  created_at timestamptz not null default now()
);
create index points_events_user on points_events (user_id);
