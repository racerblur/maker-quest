-- Additive migration for the isolated Cloudflare staging D1 only.
CREATE TABLE IF NOT EXISTS badge (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  badge TEXT NOT NULL CHECK(badge IN ('robotics','workshop','art','racing')),
  PRIMARY KEY(userId, badge)
);
CREATE TABLE IF NOT EXISTS score (
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  game TEXT NOT NULL CHECK(game IN ('bot-battle','power-racers')),
  hour INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 100000),
  PRIMARY KEY(userId, game, hour)
);
CREATE INDEX IF NOT EXISTS score_game_hour ON score(game, hour, score DESC);
