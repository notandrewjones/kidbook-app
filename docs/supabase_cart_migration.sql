-- ============================================
-- SUPABASE SHOPPING CART MIGRATION
-- Kids Book Creator - Shopping Cart System
-- ============================================

-- ============================================
-- 1. CART_ITEMS TABLE
-- ============================================
-- Stores cart items for each user
-- Each row is one line item (book + product type + size)

create table public.cart_items (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    book_id uuid references public.book_projects(id) on delete cascade not null,
    product_type text not null check (product_type in ('ebook', 'hardcover')),
    size text default null, -- null for ebook, size code for hardcover (e.g., 'square-medium')
    quantity integer not null default 1 check (quantity > 0),
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    
    -- Unique constraint: one row per user/book/product/size combination
    unique(user_id, book_id, product_type, size)
);

-- Indexes for quick lookups
create index idx_cart_items_user_id on public.cart_items(user_id);
create index idx_cart_items_book_id on public.cart_items(book_id);

-- RLS: Users can only access their own cart
alter table public.cart_items enable row level security;

create policy "Users can view their own cart items"
    on public.cart_items for select
    using (auth.uid() = user_id);

create policy "Users can insert their own cart items"
    on public.cart_items for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own cart items"
    on public.cart_items for update
    using (auth.uid() = user_id);

create policy "Users can delete their own cart items"
    on public.cart_items for delete
    using (auth.uid() = user_id);

-- Auto-update updated_at timestamp
create trigger update_cart_items_updated_at
    before update on public.cart_items
    for each row
    execute function update_updated_at_column();

-- ============================================
-- 2. HARDCOVER SIZES TABLE (for pricing)
-- ============================================
-- Different hardcover sizes may have different prices in the future
-- For now, they all map to the same Stripe product

create table public.hardcover_sizes (
    id uuid default gen_random_uuid() primary key,
    size_code text not null unique,
    display_name text not null,
    dimensions text not null, -- e.g., '8" × 8"'
    price_cents integer not null,
    stripe_price_id text, -- Can be null initially, all map to base hardcover
    is_active boolean default true,
    sort_order integer default 0,
    created_at timestamp with time zone default now()
);

-- Insert hardcover size options
insert into public.hardcover_sizes (size_code, display_name, dimensions, price_cents, sort_order) values
    ('square-small', 'Small Square', '7" × 7"', 2499, 1),
    ('square-medium', 'Medium Square', '8" × 8"', 2999, 2),
    ('square-large', 'Large Square', '10" × 10"', 3999, 3),
    ('portrait', 'Portrait', '7" × 9"', 2999, 4),
    ('landscape', 'Landscape', '10" × 7"', 3499, 5),
    ('standard', 'Standard', '8.5" × 11"', 3499, 6);

-- RLS: Sizes are publicly readable
alter table public.hardcover_sizes enable row level security;

create policy "Hardcover sizes are publicly readable"
    on public.hardcover_sizes for select
    using (true);

-- ============================================
-- 3. HELPER FUNCTION: Get cart total
-- ============================================
create or replace function public.get_cart_total(p_user_id uuid)
returns table (
    item_count integer,
    total_cents integer
)
language plpgsql
security definer
as $$
begin
    return query
    select 
        coalesce(sum(ci.quantity)::integer, 0) as item_count,
        coalesce(sum(
            case 
                when ci.product_type = 'ebook' then 
                    (select price_cents from products where name = 'ebook') * ci.quantity
                when ci.product_type = 'hardcover' then
                    coalesce(
                        (select price_cents from hardcover_sizes where size_code = ci.size),
                        (select price_cents from products where name = 'hardcover')
                    ) * ci.quantity
            end
        )::integer, 0) as total_cents
    from cart_items ci
    where ci.user_id = p_user_id;
end;
$$;

-- ============================================
-- 4. HELPER FUNCTION: Get full cart with details
-- ============================================
create or replace function public.get_cart_with_details(p_user_id uuid)
returns table (
    id uuid,
    book_id uuid,
    book_title text,
    book_thumbnail text,
    product_type text,
    size text,
    size_display_name text,
    quantity integer,
    unit_price_cents integer,
    line_total_cents integer
)
language plpgsql
security definer
as $$
begin
    return query
    select 
        ci.id,
        ci.book_id,
        coalesce(bp.selected_idea->>'title', 'Untitled Book') as book_title,
        (bp.illustrations->0->>'image_url') as book_thumbnail,
        ci.product_type,
        ci.size,
        hs.display_name as size_display_name,
        ci.quantity,
        case 
            when ci.product_type = 'ebook' then 
                (select price_cents from products where name = 'ebook')
            when ci.product_type = 'hardcover' then
                coalesce(hs.price_cents, (select price_cents from products where name = 'hardcover'))
        end as unit_price_cents,
        case 
            when ci.product_type = 'ebook' then 
                (select price_cents from products where name = 'ebook') * ci.quantity
            when ci.product_type = 'hardcover' then
                coalesce(hs.price_cents, (select price_cents from products where name = 'hardcover')) * ci.quantity
        end as line_total_cents
    from cart_items ci
    join book_projects bp on bp.id = ci.book_id
    left join hardcover_sizes hs on hs.size_code = ci.size
    where ci.user_id = p_user_id
    order by ci.created_at desc;
end;
$$;
