-- Miltenyi Lead Scanner Database Schema

-- 1. Campaigns Table (per beurs/evenement)
CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY, -- bijv. 'U-10245'
    name TEXT NOT NULL,
    location TEXT,
    start_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
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

-- 4. Row Level Security (RLS) & Policies
-- Toestaan dat de webapp met de anon/publishable key kan lezen en schrijven
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read campaigns" ON campaigns;
CREATE POLICY "Allow public read campaigns" ON campaigns FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert campaigns" ON campaigns;
CREATE POLICY "Allow public insert campaigns" ON campaigns FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update campaigns" ON campaigns;
CREATE POLICY "Allow public update campaigns" ON campaigns FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public read accounts" ON accounts;
CREATE POLICY "Allow public read accounts" ON accounts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert accounts" ON accounts;
CREATE POLICY "Allow public insert accounts" ON accounts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read leads" ON leads;
CREATE POLICY "Allow public read leads" ON leads FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert leads" ON leads;
CREATE POLICY "Allow public insert leads" ON leads FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update leads" ON leads;
CREATE POLICY "Allow public update leads" ON leads FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete leads" ON leads;
CREATE POLICY "Allow public delete leads" ON leads FOR DELETE USING (true);

-- 5. Standaard Campagne invoegen voor tests
INSERT INTO campaigns (id, name, location, is_active)
VALUES ('U-10245', 'Miltenyi Expo BNL 2026', 'Amsterdam', true)
ON CONFLICT (id) DO NOTHING;
