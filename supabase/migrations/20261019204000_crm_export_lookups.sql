CREATE TABLE IF NOT EXISTS public.crm_account_directory (
    source_order INTEGER PRIMARY KEY,
    account_name TEXT NOT NULL,
    full_name_1 TEXT NOT NULL,
    street TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT
);

CREATE TABLE IF NOT EXISTS public.campaign_elements (
    campaign_id TEXT PRIMARY KEY,
    campaign_element TEXT NOT NULL,
    source_order INTEGER NOT NULL UNIQUE
);

ALTER TABLE public.crm_account_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_elements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_account_directory FROM anon, authenticated;
REVOKE ALL ON public.campaign_elements FROM anon, authenticated;
GRANT SELECT ON public.crm_account_directory TO authenticated;
GRANT SELECT ON public.campaign_elements TO authenticated;

DROP POLICY IF EXISTS "Signed-in users can read CRM account directory" ON public.crm_account_directory;
CREATE POLICY "Signed-in users can read CRM account directory"
    ON public.crm_account_directory
    FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Signed-in users can read campaign elements" ON public.campaign_elements;
CREATE POLICY "Signed-in users can read campaign elements"
    ON public.campaign_elements
    FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);
