# Payment System Documentation

## Overview

The Kids Book Creator uses a **pay-per-export** model with Stripe as the payment processor. Users can create and preview books for free (with watermarks), then purchase exports to get clean, watermark-free versions.

## Products

| Product | Description | Price Field |
|---------|-------------|-------------|
| `ebook` | Digital PDF download | `price_cents` in products table |
| `hardcover` | Physical printed book (future) | `price_cents` in products table |

## Database Schema

### Tables

**`products`** — Available purchasable products
- Stores product info and Stripe Price IDs
- Publicly readable (no auth required)

**`customers`** — Links Supabase users to Stripe customers
- Prevents duplicate Stripe customer creation
- One record per user

**`orders`** — Tracks all purchase attempts
- Status: `pending` → `paid` / `failed` / `expired` / `refunded`
- Contains Stripe session and payment intent IDs

**`book_exports`** — Records of unlocked exports
- Tracks download counts and expiration
- Created after successful payment

**`book_projects`** (modified) — Added columns:
- `has_watermark` (boolean) — Whether exports include watermark
- `ebook_unlocked` (boolean) — Ebook purchased for this book
- `hardcover_unlocked` (boolean) — Hardcover purchased for this book

### Entity Relationships

```
users (auth.users)
  └── customers (1:1)
  └── book_projects (1:many)
        └── orders (1:many)
              └── book_exports (1:1 per order)
```

## API Endpoints

### `POST /api/checkout/create-session`

Creates a Stripe Checkout session and pending order.

**Request:**
```json
{
  "bookId": "uuid",
  "productType": "ebook" | "hardcover"
}
```

**Response:**
```json
{
  "checkoutUrl": "https://checkout.stripe.com/...",
  "sessionId": "cs_...",
  "orderId": "uuid"
}
```

**Errors:**
- `401` — Not authenticated
- `403` — Book belongs to another user
- `400` — Already purchased / invalid product type
- `404` — Book or product not found

---

### `GET /api/checkout/status?bookId=uuid`

Returns purchase/unlock status for a book.

**Response:**
```json
{
  "bookId": "uuid",
  "title": "Book Title",
  "hasWatermark": true,
  "products": {
    "ebook": {
      "productId": "uuid",
      "displayName": "Digital Ebook",
      "priceCents": 999,
      "priceFormatted": "$9.99",
      "unlocked": false,
      "purchasedAt": null,
      "hasPendingOrder": false,
      "export": null
    },
    "hardcover": { ... }
  }
}
```

---

### `POST /api/webhooks/stripe`

Handles Stripe webhook events. **Do not call directly.**

**Events handled:**
- `checkout.session.completed` — Marks order paid, unlocks book
- `checkout.session.expired` — Marks order expired
- `charge.refunded` — Marks order refunded, re-locks book

## Payment Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User clicks "Export Ebook"                                  │
│           │                                                      │
│           ▼                                                      │
│  2. Frontend calls GET /api/checkout/status                     │
│           │                                                      │
│           ▼                                                      │
│  3. Check: Is ebook_unlocked = true?                            │
│           │                                                      │
│     ┌─────┴─────┐                                               │
│     │           │                                                │
│    YES          NO                                               │
│     │           │                                                │
│     ▼           ▼                                                │
│  Generate    4. Frontend calls POST /api/checkout/create-session│
│  clean PDF      │                                                │
│     │           ▼                                                │
│     │      5. Backend creates pending order in DB               │
│     │           │                                                │
│     │           ▼                                                │
│     │      6. Backend creates Stripe Checkout Session           │
│     │           │                                                │
│     │           ▼                                                │
│     │      7. User redirected to Stripe Checkout                │
│     │           │                                                │
│     │           ▼                                                │
│     │      8. User completes payment                            │
│     │           │                                                │
│     │           ▼                                                │
│     │      9. Stripe sends webhook to /api/webhooks/stripe      │
│     │           │                                                │
│     │           ▼                                                │
│     │      10. Webhook updates order status to "paid"           │
│     │           │                                                │
│     │           ▼                                                │
│     │      11. Webhook sets ebook_unlocked = true               │
│     │           │                                                │
│     │           ▼                                                │
│     │      12. User redirected to success URL                   │
│     │           │                                                │
│     └───────────┴───────────────────────────────────────────────│
│                 │                                                │
│                 ▼                                                │
│          User can now export watermark-free PDF                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Environment Variables

Add these to your Vercel project:

| Variable | Description | Example |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | Stripe API secret key | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_...` |

**Note:** Use test keys (`sk_test_`) during development, live keys (`sk_live_`) in production.

## Stripe Dashboard Setup

### 1. Create Products

1. Go to Stripe Dashboard → Products
2. Create "Digital Ebook" product with price (e.g., $9.99)
3. Create "Printed Hardcover" product with price (e.g., $29.99)
4. Copy each Price ID (`price_...`) to your Supabase `products` table

### 2. Configure Webhook

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `charge.refunded`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET` env var

## Frontend Integration

### Check Status
```javascript
import { getBookPurchaseStatus } from './js/api/checkout.js';

const status = await getBookPurchaseStatus(bookId);
if (status.products.ebook.unlocked) {
  // Generate clean export
} else {
  // Show purchase modal
}
```

### Initiate Checkout
```javascript
import { redirectToCheckout } from './js/api/checkout.js';

await redirectToCheckout(bookId, 'ebook');
// User is redirected to Stripe
```

### Handle Return
```javascript
import { checkPaymentReturn, clearPaymentParams } from './js/api/checkout.js';

const { success, cancelled, orderId } = checkPaymentReturn();
if (success) {
  showSuccessMessage();
  clearPaymentParams();
}
```

## Testing

### Test Card Numbers

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Decline |
| `4000 0000 0000 3220` | 3D Secure required |

Use any future expiry date and any 3-digit CVC.

### Test Webhook Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## Going Live Checklist

- [ ] Switch Stripe API keys from test to live
- [ ] Update webhook endpoint to production URL
- [ ] Update `STRIPE_WEBHOOK_SECRET` with live webhook secret
- [ ] Set real prices in Stripe products
- [ ] Update `stripe_price_id` in Supabase products table
- [ ] Test a real transaction with a real card
- [ ] Enable Stripe Radar for fraud protection
