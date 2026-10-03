-- Demo data. Uses INSERT OR IGNORE so re-running never duplicates.
INSERT OR IGNORE INTO users (name, email, age) VALUES
  ('Alice Johnson', 'alice@vault.dev', 28),
  ('Bob Smith',     'bob@vault.dev',   34);

INSERT OR IGNORE INTO profiles (user_id, bio, avatar_url) VALUES
  (1, 'Security engineer. Loves ACID.', 'https://vault.dev/avatars/alice.png'),
  (2, 'Database administrator.',        NULL);

INSERT OR IGNORE INTO vault_entries (user_id, title, content, size_kb) VALUES
  (1, 'Passport Scan',   'encrypted blob...', 812),
  (1, 'Recovery Keys',   'ssh-rsa AAAA...',     4),
  (2, 'Tax Returns 2025','pdf bytes...',      1024);

INSERT OR IGNORE INTO tags (name) VALUES ('identity'), ('finance'), ('keys');

INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (1, 1), (3, 2), (2, 3);
