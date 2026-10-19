-- Lead Scanner Database Schema

-- 1. Campaigns Table (per beurs/evenement)
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, -- bijv. 'U-10245'
    name TEXT NOT NULL,
    location TEXT,
    start_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRM export lookup data. The source workbook is imported separately and is not stored in the repository.
CREATE TABLE IF NOT EXISTS crm_account_directory (
    source_order INTEGER PRIMARY KEY,
    account_name TEXT NOT NULL,
    full_name_1 TEXT NOT NULL,
    street TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT
);

CREATE TABLE IF NOT EXISTS campaign_elements (
    campaign_id TEXT PRIMARY KEY,
    campaign_element TEXT NOT NULL,
    source_order INTEGER NOT NULL UNIQUE
);

-- 2. CRM Accounts Table (~3.500 account levels)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_1 TEXT NOT NULL, -- Bovenliggend Instituut / Biotech
    level_2 TEXT,          -- Instituut / Samenwerkingsverband
    level_3 TEXT,          -- Afdeling / Department
    country TEXT DEFAULT 'NL',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_level1 ON accounts(level_1);
CREATE INDEX IF NOT EXISTS idx_accounts_level3 ON accounts(level_3);

-- 3. Leads Table (De 7 velden + metadata)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
    collected_by TEXT NOT NULL, -- Medewerker die de lead gescand heeft
    
    -- De 7 formuliervelden
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    institute TEXT,             -- CRM Niveau 1/2
    department TEXT,            -- CRM Niveau 3
    notes TEXT,                 -- Productinteresse / Notities (2-3 zinnen)
    newsletter_opt_in BOOLEAN DEFAULT FALSE, -- Opt-in checkbox onderaan formulier
    
    -- CRM & Kwaliteit metadata
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    email_warning BOOLEAN DEFAULT FALSE,     -- Waarschuwing als e-mail afwijkt
    confidence_flags JSONB DEFAULT '[]'::jsonb, -- Woorden met lage OCR-zekerheid
    image_url TEXT,                          -- Optionele link naar foto / crop
    status TEXT DEFAULT 'reviewed',          -- 'draft', 'reviewed', 'exported'
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- Store each signed-in user's private OCR corrections separately.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ocr_suggestions JSONB;

CREATE TABLE IF NOT EXISTS user_ocr_corrections (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    field TEXT NOT NULL CHECK (field IN ('first_name', 'last_name', 'email', 'institute', 'department', 'notes')),
    source_text TEXT NOT NULL CHECK (length(source_text) > 0),
    corrected_text TEXT NOT NULL CHECK (length(corrected_text) > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, field, source_text)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_ocr_corrections TO authenticated;
ALTER TABLE user_ocr_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own OCR corrections" ON user_ocr_corrections;
CREATE POLICY "Users manage their own OCR corrections"
    ON user_ocr_corrections
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. Row Level Security (RLS) & Policies
-- All app access requires an invited, authenticated Supabase user.
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_account_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_elements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON crm_account_directory FROM anon, authenticated;
REVOKE ALL ON campaign_elements FROM anon, authenticated;
GRANT SELECT ON crm_account_directory TO authenticated;
GRANT SELECT ON campaign_elements TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'leads'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
    END IF;
END
$$;

DROP POLICY IF EXISTS "Allow public read campaigns" ON campaigns;
DROP POLICY IF EXISTS "Allow public insert campaigns" ON campaigns;
DROP POLICY IF EXISTS "Allow public update campaigns" ON campaigns;
DROP POLICY IF EXISTS "Authenticated users can access campaigns" ON campaigns;
CREATE POLICY "Authenticated users can access campaigns" ON campaigns
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Signed-in users can read CRM account directory" ON crm_account_directory;
CREATE POLICY "Signed-in users can read CRM account directory" ON crm_account_directory
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Signed-in users can read campaign elements" ON campaign_elements;
CREATE POLICY "Signed-in users can read campaign elements" ON campaign_elements
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow public read accounts" ON accounts;
DROP POLICY IF EXISTS "Allow public insert accounts" ON accounts;
DROP POLICY IF EXISTS "Authenticated users can access accounts" ON accounts;
CREATE POLICY "Authenticated users can access accounts" ON accounts
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Allow public read leads" ON leads;
DROP POLICY IF EXISTS "Allow public insert leads" ON leads;
DROP POLICY IF EXISTS "Allow public update leads" ON leads;
DROP POLICY IF EXISTS "Allow public delete leads" ON leads;
DROP POLICY IF EXISTS "Authenticated users can access leads" ON leads;
CREATE POLICY "Authenticated users can access leads" ON leads
    FOR ALL TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Standaard Campagne invoegen voor tests
INSERT INTO campaigns (id, name, location, is_active)
VALUES ('U-10245', 'Sample Campaign', 'Amsterdam', true)
ON CONFLICT (id) DO NOTHING;
