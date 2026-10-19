CREATE TABLE IF NOT EXISTS public.user_ocr_corrections (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    field TEXT NOT NULL CHECK (field IN ('first_name', 'last_name', 'email', 'institute', 'department', 'notes')),
    source_text TEXT NOT NULL CHECK (length(source_text) > 0),
    corrected_text TEXT NOT NULL CHECK (length(corrected_text) > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, field, source_text)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ocr_corrections TO authenticated;
ALTER TABLE public.user_ocr_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own OCR corrections" ON public.user_ocr_corrections;
CREATE POLICY "Users manage their own OCR corrections"
    ON public.user_ocr_corrections
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS ocr_suggestions JSONB;
