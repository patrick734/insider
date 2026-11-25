-- When X details (followers, account age, bio) were last fetched from the X API, so it's at most once a day per person.
alter table users add column if not exists x_synced_at timestamptz;
