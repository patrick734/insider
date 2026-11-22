-- Waitlist-first launch: the full app opens only to people granted access (founding hosts, approved founders).
alter table users add column app_access boolean not null default false;
alter table users add column app_access_at timestamptz;

-- Everyone who already hosts a room keeps access.
update users set app_access = true, app_access_at = now() where id in (select host_id from rooms);
