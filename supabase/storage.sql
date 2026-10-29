-- Apply only to the chosen Supabase project after reviewing the bucket name.
-- Keep private; no browser policies. All access is through Tally Ho's server.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('costume-photos', 'costume-photos', false, 2000000, ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- Refuse to silently adopt an existing public bucket or unexpected settings.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id='costume-photos' AND public=false
      AND file_size_limit=2000000
      AND allowed_mime_types @> ARRAY['image/png','image/jpeg','image/webp']
      AND allowed_mime_types <@ ARRAY['image/png','image/jpeg','image/webp']
  ) THEN RAISE EXCEPTION 'Review costume-photos bucket settings before continuing'; END IF;
END $$;
