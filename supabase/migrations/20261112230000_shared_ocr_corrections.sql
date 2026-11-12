-- The owner-backed view exposes only aggregated vocabulary, not users or private fields.
CREATE OR REPLACE VIEW public.shared_ocr_corrections
WITH (security_barrier = true) AS
WITH votes AS (
    SELECT source_text, corrected_text, COUNT(DISTINCT user_id) AS supporters
    FROM public.user_ocr_corrections
    WHERE field IN ('institute', 'department', 'notes')
    GROUP BY source_text, corrected_text
),
ranked AS (
    SELECT *, DENSE_RANK() OVER (
        PARTITION BY source_text ORDER BY supporters DESC
    ) AS preference
    FROM votes
),
winners AS (
    SELECT *, COUNT(*) OVER (PARTITION BY source_text) AS alternatives
    FROM ranked
    WHERE preference = 1
)
SELECT source_text, corrected_text
FROM winners
WHERE alternatives = 1;

REVOKE ALL ON public.shared_ocr_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.shared_ocr_corrections TO authenticated;
