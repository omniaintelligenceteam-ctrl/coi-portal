-- =============================================================================
-- COI Portal — Visual Form Mapper, Phase 4: relax coi-archive mime allowlist
--
-- The bucket originally allowed only application/pdf (issued certificates).
-- The visual mapper writes three artifacts per uploaded form:
--   templates/<id>/template.pdf  (application/pdf — already allowed)
--   templates/<id>/page-<n>.png  (image/png      — NEW)
--   templates/<id>/anchors.json  (application/json — NEW)
--
-- Add the two new types. File size limit (10 MB) and private flag stay put.
-- =============================================================================

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/png', 'application/json']
 where id = 'coi-archive';
