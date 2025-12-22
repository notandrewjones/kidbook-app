-- ============================================
-- SUPABASE PAYMENTS MIGRATION
-- Kids Book Creator - Pay-per-export model
-- ============================================

-- ============================================
-- 1. PRODUCTS TABLE
-- ============================================
create table public.products (
    id uuid default gen_random_uuid() primary key,
    name text not null unique,
    display_name text not null,
    description text,
    price_cents integer not null,
    stripe_price_id text,
    is_active boolean default true,
    sort_order integer default 0,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Insert your two products
insert into public.products (name, display_name, description, price_cents, sort_order) values
    ('ebook', 'Digital Ebook', 'High-quality PDF download of your book', 999, 1),
    ('hardcover', 'Printed Hardcover', 'Professional hardcover book shipped to you', 2999, 2);

-- RLS: Products are publicly readable
alter table public.products enable row level security;

create policy "Products are publicly readable"
    on public.products for select
    using (true);

-- ============================================
-- 2. CUSTOMERS TABLE
-- ============================================
create table public.customers (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null unique,
    stripe_customer_id text unique,
    email text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Index for quick lookups
create index idx_customers_user_id on public.customers(user_id);
create index idx_customers_stripe_customer_id on public.customers(stripe_customer_id);

-- RLS: Users can only read their own customer record
alter table public.customers enable row level security;

create policy "Users can view their own customer record"
    on public.customers for select
    using (auth.uid() = user_id);

create policy "Users can insert their own customer record"
    on public.customers for insert
    with check (auth.uid() = user_id);

-- ============================================
-- 3. ORDERS TABLE
-- ============================================
create table public.orders (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    book_id uuid not null, -- Add FK constraint if you have a books table: references public.books(id)
    product_id uuid references public.products(id) not null,
    
    -- Pricing snapshot (important: prices can change, store what they paid)
    amount_cents integer not null,
    currency text default 'usd',
    
    -- Status tracking
    status text default 'pending' check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
    
    -- Stripe references
    stripe_checkout_session_id text unique,
    stripe_payment_intent_id text,
    
    -- Timestamps
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    paid_at timestamp with time zone,
    
    -- Prevent duplicate purchases of same product for same book
    unique(book_id, product_id, status) 
);

-- Note: The unique constraint above will need adjustment if you want to allow 
-- re-purchases after refunds. Alternative approach below:
-- Remove the unique constraint and handle duplicates in application logic

-- Drop the overly restrictive constraint and use a partial unique index instead
alter table public.orders drop constraint if exists orders_book_id_product_id_status_key;

-- Only prevent duplicate *paid* orders for the same book/product combo
create unique index idx_orders_unique_paid 
    on public.orders(book_id, product_id) 
    where (status = 'paid');

-- Other useful indexes
create index idx_orders_user_id on public.orders(user_id);
create index idx_orders_book_id on public.orders(book_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_stripe_session on public.orders(stripe_checkout_session_id);

-- RLS: Users can only see and create their own orders
alter table public.orders enable row level security;

create policy "Users can view their own orders"
    on public.orders for select
    using (auth.uid() = user_id);

create policy "Users can create their own orders"
    on public.orders for insert
    with check (auth.uid() = user_id);

-- Note: Updates should only come from your backend/webhook, not directly from users
-- If using service_role key for webhooks, no update policy needed for users

-- ============================================
-- 4. BOOK EXPORTS TABLE
-- ============================================
create table public.book_exports (
    id uuid default gen_random_uuid() primary key,
    book_id uuid not null, -- Add FK if you have books table
    order_id uuid references public.orders(id) on delete set null,
    user_id uuid references auth.users(id) on delete cascade not null,
    
    -- What was exported
    product_type text not null check (product_type in ('ebook', 'hardcover')),
    
    -- File info
    file_path text, -- Path in Supabase Storage
    file_size_bytes bigint,
    
    -- Download tracking
    download_count integer default 0,
    max_downloads integer default 10, -- Optional limit
    
    -- Timestamps
    created_at timestamp with time zone default now(),
    expires_at timestamp with time zone default (now() + interval '30 days'),
    last_downloaded_at timestamp with time zone
);

create index idx_book_exports_book_id on public.book_exports(book_id);
create index idx_book_exports_user_id on public.book_exports(user_id);
create index idx_book_exports_order_id on public.book_exports(order_id);

-- RLS: Users can only see their own exports
alter table public.book_exports enable row level security;

create policy "Users can view their own exports"
    on public.book_exports for select
    using (auth.uid() = user_id);

-- ============================================
-- 5. ADD COLUMNS TO EXISTING BOOKS TABLE
-- ============================================
-- IMPORTANT: Run this section for your book_projects table

alter table public.book_projects 
    add column if not exists has_watermark boolean default true,
    add column if not exists ebook_unlocked boolean default false,
    add column if not exists hardcover_unlocked boolean default false;

-- Index for quick filtering of unlocked books
create index if not exists idx_book_projects_ebook_unlocked on public.book_projects(ebook_unlocked) where ebook_unlocked = true;
create index if not exists idx_book_projects_hardcover_unlocked on public.book_projects(hardcover_unlocked) where hardcover_unlocked = true;

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to check if a book has a paid export of a given type
create or replace function public.is_book_unlocked(
    p_book_id uuid,
    p_product_type text
)
returns boolean
language sql
security definer
stable
as $$
    select exists (
        select 1 
        from public.orders o
        join public.products p on p.id = o.product_id
        where o.book_id = p_book_id
        and p.name = p_product_type
        and o.status = 'paid'
    );
$$;

-- Function to get all unlocked product types for a book
create or replace function public.get_book_unlocks(p_book_id uuid)
returns table (product_type text, paid_at timestamp with time zone)
language sql
security definer
stable
as $$
    select p.name as product_type, o.paid_at
    from public.orders o
    join public.products p on p.id = o.product_id
    where o.book_id = p_book_id
    and o.status = 'paid';
$$;

-- ============================================
-- 7. UPDATED_AT TRIGGER
-- ============================================
-- Automatically update the updated_at column

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger products_updated_at
    before update on public.products
    for each row execute function public.handle_updated_at();

create trigger customers_updated_at
    before update on public.customers
    for each row execute function public.handle_updated_at();

create trigger orders_updated_at
    before update on public.orders
    for each row execute function public.handle_updated_at();

-- ============================================
-- 8. STORAGE BUCKET FOR EXPORTS (Optional)
-- ============================================
-- Run this in Supabase dashboard or via API
-- Creates a private bucket for storing generated book files

-- insert into storage.buckets (id, name, public)
-- values ('book-exports', 'book-exports', false);

-- Storage policy: users can only access their own exports
-- create policy "Users can download their own exports"
--     on storage.objects for select
--     using (
--         bucket_id = 'book-exports' 
--         and auth.uid()::text = (storage.foldername(name))[1]
--     );

-- ============================================
-- NOTES FOR YOUR BACKEND
-- ============================================
/*
WEBHOOK FLOW (use service_role key for these operations):

1. On checkout.session.completed:
   
   update public.orders
   set 
       status = 'paid',
       stripe_payment_intent_id = [from webhook],
       paid_at = now()
   where stripe_checkout_session_id = [session_id];

2. Then unlock the book:
   
   update public.books
   set ebook_unlocked = true  -- or hardcover_unlocked
   where id = [book_id];

3. Create the export record:
   
   insert into public.book_exports (book_id, order_id, user_id, product_type, file_path)
   values ([book_id], [order_id], [user_id], 'ebook', [generated_file_path]);

CHECKOUT FLOW:

1. Create pending order:
   
   insert into public.orders (user_id, book_id, product_id, amount_cents)
   select [user_id], [book_id], id, price_cents
   from public.products
   where name = 'ebook'
   returning id;

2. Create Stripe Checkout Session with order ID in metadata

3. Update order with session ID:
   
   update public.orders
   set stripe_checkout_session_id = [session_id]
   where id = [order_id];

4. Redirect user to Stripe Checkout

*/
