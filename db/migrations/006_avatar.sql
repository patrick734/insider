-- Where the avatar came from: 'x' (copied from X), 'upload', or 'default' (the person chose no photo).
-- An X sign-in fills the avatar from X only while this is null, so a deliberate choice is never overwritten.
alter table users add column if not exists avatar_source text check (avatar_source in ('x', 'upload', 'default'));
