-- ============================================
-- LULU PRINT-ON-DEMAND INTEGRATION MIGRATION
-- Kids Book Creator - Lulu API Integration
-- ============================================

-- ============================================
-- 1. LULU PRINT JOBS TABLE
-- Tracks all print jobs sent to Lulu
-- ============================================
CREATE TABLE IF NOT EXISTS public.lulu_print_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- References
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
    book_id UUID NOT NULL, -- Reference to book_projects
    
    -- Lulu identifiers
    lulu_print_job_id BIGINT UNIQUE, -- Lulu's print job ID
    lulu_order_id TEXT, -- Lulu's order reference
    external_id TEXT, -- Our external reference (usually our order ID)
    
    -- Product specification
    pod_package_id VARCHAR(27) NOT NULL, -- Lulu's product SKU
    page_count INTEGER NOT NULL,
    quantity INTEGER DEFAULT 1,
    
    -- File URLs (must be publicly accessible)
    interior_pdf_url TEXT,
    cover_pdf_url TEXT,
    
    -- File validation status
    interior_validation_id INTEGER,
    interior_validation_status TEXT, -- NULL, VALIDATING, VALIDATED, NORMALIZED, ERROR
    cover_validation_id INTEGER,
    cover_validation_status TEXT, -- NULL, NORMALIZING, NORMALIZED, ERROR
    
    -- Lulu print job status
    lulu_status TEXT DEFAULT 'pending_submission',
    -- Possible values: pending_submission, created, unpaid, payment_in_progress,
    -- production_delayed, production_ready, in_production, shipped, rejected, canceled
    
    lulu_status_message TEXT,
    lulu_status_changed_at TIMESTAMP WITH TIME ZONE,
    
    -- Shipping details (captured from Stripe checkout)
    shipping_level TEXT DEFAULT 'MAIL', -- MAIL, PRIORITY_MAIL, GROUND, EXPEDITED, EXPRESS
    shipping_name TEXT,
    shipping_street1 TEXT,
    shipping_street2 TEXT,
    shipping_city TEXT,
    shipping_state_code TEXT,
    shipping_postcode TEXT,
    shipping_country_code TEXT DEFAULT 'US',
    shipping_phone TEXT,
    shipping_email TEXT,
    
    -- Tracking info (populated when shipped)
    tracking_id TEXT,
    tracking_urls TEXT[], -- Array of tracking URLs
    carrier_name TEXT,
    
    -- Cost information from Lulu
    lulu_cost_cents INTEGER, -- What we pay Lulu
    lulu_currency TEXT DEFAULT 'USD',
    shipping_cost_cents INTEGER,
    tax_cents INTEGER,
    total_cost_cents INTEGER,
    
    -- Estimated dates
    estimated_ship_date DATE,
    estimated_delivery_min DATE,
    estimated_delivery_max DATE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE, -- When sent to Lulu
    shipped_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_lulu_jobs_order_id ON public.lulu_print_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_lulu_jobs_user_id ON public.lulu_print_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_lulu_jobs_book_id ON public.lulu_print_jobs(book_id);
CREATE INDEX IF NOT EXISTS idx_lulu_jobs_lulu_id ON public.lulu_print_jobs(lulu_print_job_id);
CREATE INDEX IF NOT EXISTS idx_lulu_jobs_status ON public.lulu_print_jobs(lulu_status);
CREATE INDEX IF NOT EXISTS idx_lulu_jobs_external_id ON public.lulu_print_jobs(external_id);

-- ============================================
-- 2. ADD LULU FIELDS TO ORDERS TABLE
-- ============================================
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS lulu_print_job_id UUID REFERENCES public.lulu_print_jobs(id),
    ADD COLUMN IF NOT EXISTS lulu_submitted_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS lulu_status TEXT,
    ADD COLUMN IF NOT EXISTS fulfillment_error TEXT;

-- Index for Lulu print job lookups
CREATE INDEX IF NOT EXISTS idx_orders_lulu_job ON public.orders(lulu_print_job_id);

-- ============================================
-- 3. POD PACKAGE MAPPINGS TABLE
-- Maps your book sizes to Lulu's pod_package_id
-- ============================================
CREATE TABLE IF NOT EXISTS public.lulu_pod_packages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Your internal size code (matches hardcover_sizes)
    size_code TEXT NOT NULL UNIQUE,
    
    -- Lulu's pod package ID (27 character code)
    pod_package_id VARCHAR(27) NOT NULL,
    
    -- Human-readable description
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Dimensions
    width_inches DECIMAL(5,2),
    height_inches DECIMAL(5,2),
    
    -- Binding type
    binding_type TEXT DEFAULT 'hardcover', -- hardcover, paperback, coil
    
    -- Color type
    color_type TEXT DEFAULT 'full_color', -- full_color, black_white
    
    -- Paper type
    paper_type TEXT DEFAULT '80lb_coated', -- 60lb_uncoated, 80lb_coated, etc.
    
    -- Cover finish
    cover_finish TEXT DEFAULT 'gloss', -- gloss, matte
    
    -- Min/max page counts for this format
    min_pages INTEGER DEFAULT 24,
    max_pages INTEGER DEFAULT 800,
    
    -- Pricing (your markup over Lulu's cost)
    base_price_cents INTEGER, -- Your retail price
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default mappings for children's book sizes
INSERT INTO public.lulu_pod_packages 
    (size_code, pod_package_id, display_name, description, width_inches, height_inches, min_pages, base_price_cents)
VALUES
    -- Square formats - most popular for children's books
    ('square-small', '0700X0700FCSTDHC080CW444GXX', '7" x 7" Square', 'Compact square hardcover, perfect for younger readers', 7.0, 7.0, 24, 2999),
    ('square-medium', '0850X0850FCSTDHC080CW444GXX', '8.5" x 8.5" Square', 'Standard square hardcover, most popular size', 8.5, 8.5, 24, 3499),
    ('square-large', '1000X1000FCSTDHC080CW444GXX', '10" x 10" Square', 'Large square hardcover, stunning visuals', 10.0, 10.0, 24, 3999),
    
    -- Landscape formats
    ('landscape-medium', '1100X0850FCSTDHC080CW444GXX', '11" x 8.5" Landscape', 'Wide format for panoramic illustrations', 11.0, 8.5, 24, 3499),
    
    -- Portrait formats  
    ('portrait-medium', '0850X1100FCSTDHC080CW444GXX', '8.5" x 11" Portrait', 'Tall format, great for story-heavy books', 8.5, 11.0, 24, 3499)
ON CONFLICT (size_code) DO UPDATE SET
    pod_package_id = EXCLUDED.pod_package_id,
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    width_inches = EXCLUDED.width_inches,
    height_inches = EXCLUDED.height_inches,
    min_pages = EXCLUDED.min_pages,
    base_price_cents = EXCLUDED.base_price_cents,
    updated_at = NOW();

-- ============================================
-- 4. LULU WEBHOOK EVENTS LOG
-- Track all webhook events from Lulu
-- ============================================
CREATE TABLE IF NOT EXISTS public.lulu_webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    
    -- Event details
    topic TEXT NOT NULL, -- PRINT_JOB_STATUS_CHANGED, etc.
    print_job_id BIGINT,
    external_id TEXT,
    
    -- Full payload
    payload JSONB NOT NULL,
    
    -- Verification
    hmac_signature TEXT,
    verified BOOLEAN DEFAULT false,
    
    -- Processing
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    -- Timestamps
    received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lulu_webhooks_job_id ON public.lulu_webhook_events(print_job_id);
CREATE INDEX IF NOT EXISTS idx_lulu_webhooks_processed ON public.lulu_webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_lulu_webhooks_received ON public.lulu_webhook_events(received_at);

-- ============================================
-- 5. BOOK EXPORTS - ADD LULU FIELDS
-- Track print-ready file storage
-- ============================================
ALTER TABLE public.book_exports
    ADD COLUMN IF NOT EXISTS interior_pdf_path TEXT,
    ADD COLUMN IF NOT EXISTS cover_pdf_path TEXT,
    ADD COLUMN IF NOT EXISTS lulu_ready BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS lulu_interior_validated BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS lulu_cover_validated BOOLEAN DEFAULT false;

-- ============================================
-- 6. RLS POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE public.lulu_print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lulu_pod_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lulu_webhook_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own print jobs
CREATE POLICY "Users can view their own print jobs"
    ON public.lulu_print_jobs FOR SELECT
    USING (auth.uid() = user_id);

-- POD packages are publicly readable
CREATE POLICY "POD packages are publicly readable"
    ON public.lulu_pod_packages FOR SELECT
    USING (true);

-- Webhook events are only accessible via service role (no user access)
-- No policy needed - default deny is correct

-- ============================================
-- 7. HELPER FUNCTIONS
-- ============================================

-- Function to get print-ready status for an order
CREATE OR REPLACE FUNCTION public.get_order_print_status(p_order_id UUID)
RETURNS TABLE (
    order_id UUID,
    lulu_job_id BIGINT,
    lulu_status TEXT,
    lulu_status_message TEXT,
    tracking_id TEXT,
    carrier_name TEXT,
    estimated_delivery_min DATE,
    estimated_delivery_max DATE,
    shipped_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT 
        o.id as order_id,
        lpj.lulu_print_job_id as lulu_job_id,
        lpj.lulu_status,
        lpj.lulu_status_message,
        lpj.tracking_id,
        lpj.carrier_name,
        lpj.estimated_delivery_min,
        lpj.estimated_delivery_max,
        lpj.shipped_at
    FROM public.orders o
    LEFT JOIN public.lulu_print_jobs lpj ON o.lulu_print_job_id = lpj.id
    WHERE o.id = p_order_id;
$$;

-- Function to map size code to pod_package_id
CREATE OR REPLACE FUNCTION public.get_pod_package_id(p_size_code TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT pod_package_id 
    FROM public.lulu_pod_packages 
    WHERE size_code = p_size_code 
    AND is_active = true;
$$;

-- ============================================
-- 8. UPDATED_AT TRIGGER
-- ============================================

-- Apply updated_at trigger to new tables
CREATE TRIGGER lulu_print_jobs_updated_at
    BEFORE UPDATE ON public.lulu_print_jobs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER lulu_pod_packages_updated_at
    BEFORE UPDATE ON public.lulu_pod_packages
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================
-- NOTES FOR IMPLEMENTATION
-- ============================================
/*
FLOW:
1. Customer completes Stripe checkout for hardcover
2. Stripe webhook (checkout.session.completed) fires
3. We mark order as paid
4. We generate print-ready PDFs (interior + cover)
5. Upload PDFs to public storage (R2/S3)
6. Create lulu_print_jobs record with file URLs
7. Call Lulu API to create print job
8. Lulu validates files and starts production
9. Lulu webhook notifies us of status changes
10. We update order fulfillment status accordingly

LULU POD PACKAGE ID FORMAT:
Trim Size + Color + Print Quality + Bind + Paper + PPI + Finish + Linen + Foil
Example: 0850X0850FCSTDHC080CW444GXX
- 0850X0850: 8.5" x 8.5"
- FC: Full Color
- STD: Standard Quality
- HC: Hardcover
- 080CW444: 80# Coated White paper, 444 PPI
- G: Gloss cover finish
- X: No linen
- X: No foil

FILE REQUIREMENTS:
- Interior: PDF, minimum 2 pages, all same size
- Cover: PDF, one-piece wraparound cover with spine
- Files must be publicly accessible URLs
- Use Lulu's cover dimension calculator for exact sizes

SHIPPING LEVELS:
- MAIL: Cheapest, 2-3 weeks
- PRIORITY_MAIL: 1-2 weeks
- GROUND: Ground courier (US)
- EXPEDITED: 2-5 days
- EXPRESS: 1-3 days

PRODUCTION DELAY:
- Minimum 60 minutes
- Allows cancellation before production
- Set higher (e.g., 120 min) to handle refund requests
*/
