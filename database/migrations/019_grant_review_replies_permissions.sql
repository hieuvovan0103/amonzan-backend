-- Ensure already-created review_replies can be queried by the backend Supabase service role.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE review_replies TO service_role;

