-- RCSU Election 2026-2027 | Database author: Reinhardson Sangma
-- Cover foreign-key columns used for candidate and ballot relationships.
create index if not exists candidates_position_key_idx
  on election_private.candidates(position_key);
create index if not exists ballots_position_key_idx
  on election_private.ballots(position_key);
create index if not exists ballots_candidate_position_idx
  on election_private.ballots(candidate_id,position_key);
