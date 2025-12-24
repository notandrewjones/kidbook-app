# Lulu Integration Map

## File Structure (New files marked with ✨)

```
api/
├── _auth.js                      # Existing - shared auth helper
├── admin/
│   ├── _admin-auth.js            # Existing - admin auth
│   ├── orders.js                 # Existing - view orders
│   ├── order-update.js           # Existing - update orders
│   ├── refund.js                 # Existing - process refunds
│   └── lulu-jobs.js              # ✨ NEW - manage print jobs
├── cart/
│   ├── checkout.js               # Existing - creates Stripe session
│   └── sizes.js                  # Existing - hardcover sizes
├── checkout/
│   ├── create-session.js         # Existing - single item checkout
│   └── status.js                 # Existing - check payment status
├── lulu/                         # ✨ NEW FOLDER
│   ├── client.js                 # ✨ Core API client
│   ├── calculate-shipping.js     # ✨ Get shipping costs
│   ├── generate-pdfs.js          # ✨ PDF specs endpoint
│   ├── upload-pdf.js             # ✨ Upload PDFs to storage
│   └── submit-print-job.js       # ✨ Submit to Lulu
├── orders/
│   ├── [id].js                   # Existing - order details
│   ├── list.js                   # Existing - list orders
│   └── cancel.js                 # Existing - cancel order
└── webhooks/
    ├── stripe.js                 # 🔄 MODIFIED - now queues Lulu jobs
    └── lulu.js                   # ✨ NEW - receive Lulu updates

js/api/
├── cart.js                       # Existing
├── checkout.js                   # Existing
├── orders.js                     # Existing
└── lulu.js                       # ✨ NEW - client-side Lulu API

docs/
├── PAYMENTS.md                   # Existing
├── supabase_payments_migration.sql   # Existing
├── supabase_lulu_migration.sql       # ✨ NEW - Lulu database tables
└── LULU_INTEGRATION.md               # ✨ NEW - documentation
```

## Connection Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CUSTOMER CHECKOUT FLOW                            │
└─────────────────────────────────────────────────────────────────────────────┘

   Customer adds hardcover to cart
              │
              ▼
   ┌─────────────────────┐
   │  api/cart/sizes.js  │  ← Gets available sizes (existing)
   └─────────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │  api/cart/checkout.js           │  ← Creates Stripe session (existing)
   │  - Collects shipping address    │
   │  - Creates pending order        │
   └─────────────────────────────────┘
              │
              ▼
   ┌─────────────────────┐
   │   Stripe Checkout   │  ← Customer pays (external)
   └─────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAYMENT WEBHOOK FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌────────────────────────────────────────────┐
   │  api/webhooks/stripe.js  (🔄 MODIFIED)     │
   │                                            │
   │  handleCheckoutCompleted()                 │
   │    ├── Updates order status to "paid"     │
   │    ├── Unlocks book                       │
   │    ├── Creates export record              │
   │    │                                      │
   │    └── IF hardcover:                      │
   │        └── queueLuluSubmission() ──────────┼──► NEW: Queues for Lulu
   │            ├── Saves shipping address     │
   │            └── Sets fulfillment_status    │
   │                = 'pending_pdf'            │
   └────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRINT FULFILLMENT FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

   Order with fulfillment_status = 'pending_pdf'
              │
              ▼
   ┌─────────────────────────────────┐
   │  api/lulu/generate-pdfs.js  ✨  │  ← Get PDF requirements
   │  - Returns dimensions           │
   │  - Returns page specs           │
   │  - Returns upload endpoints     │
   └─────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │  Client-side PDF generation     │  ← Uses your existing compositor
   │  (js/compositor/exporter.js)    │
   └─────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │  api/lulu/upload-pdf.js  ✨     │  ← Upload interior + cover PDFs
   │  - Stores in Supabase/R2        │
   │  - Returns public URLs          │
   └─────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │  api/lulu/submit-print-job.js ✨│  ← Submit to Lulu API
   │  - Uses api/lulu/client.js ✨   │
   │  - Creates lulu_print_jobs row  │
   │  - Calls Lulu createPrintJob    │
   └─────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │  Lulu prints & ships book       │  ← External (Lulu handles this)
   └─────────────────────────────────┘
              │
              ▼
   ┌─────────────────────────────────┐
   │  api/webhooks/lulu.js  ✨       │  ← Lulu sends status updates
   │  - Updates lulu_print_jobs      │
   │  - Updates order fulfillment    │
   │  - Saves tracking info          │
   └─────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            ADMIN MANAGEMENT                                 │
└─────────────────────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────┐
   │  api/admin/lulu-jobs.js  ✨                 │
   │                                             │
   │  GET  - List all print jobs                 │
   │  POST - Actions:                            │
   │    ├── submit    - Submit order to Lulu    │
   │    ├── retry     - Retry failed job        │
   │    ├── cancel    - Cancel job              │
   │    ├── sync_status - Refresh from Lulu     │
   │    └── sync_all  - Refresh all active jobs │
   └─────────────────────────────────────────────┘
              │
              │  Uses
              ▼
   ┌─────────────────────────────────┐
   │  api/admin/orders.js (existing) │  ← Existing admin orders still works
   │  - Now shows lulu_status field  │
   └─────────────────────────────────┘
```

## What's Already Connected

### ✅ Stripe Webhook → Lulu Queue
The `api/webhooks/stripe.js` file was **modified** to automatically call `queueLuluSubmission()` when a hardcover order is paid. This is the main integration point.

### ✅ Lulu Client → All Lulu Endpoints
The `api/lulu/client.js` is imported by:
- `api/lulu/calculate-shipping.js`
- `api/lulu/submit-print-job.js`
- `api/admin/lulu-jobs.js`
- `api/webhooks/lulu.js`

### ✅ Submit Print Job → Order Records
`api/lulu/submit-print-job.js` updates both:
- `lulu_print_jobs` table (new)
- `orders` table (existing - adds lulu_print_job_id)

## What You Need to Manually Connect

### 1. Admin Panel UI (admin.html)
You'll want to add a "Print Jobs" section to your admin panel that calls:
```javascript
// List print jobs
fetch('/api/admin/lulu-jobs')

// Submit a job
fetch('/api/admin/lulu-jobs', {
  method: 'POST',
  body: JSON.stringify({ action: 'submit', orderId: '...' })
})
```

### 2. Order Details UI (js/ui/orders.js)
Add Lulu status display to order details:
```javascript
import { getStatusInfo } from '../api/lulu.js';

// In your order display code:
const statusInfo = getStatusInfo(order.fulfillmentStatus);
// Show statusInfo.label, statusInfo.description, etc.
```

### 3. PDF Generation Trigger
Currently PDFs need to be generated manually. Options:

**Option A: Admin triggers it**
```javascript
// In admin panel after order is paid
const requirements = await fetch('/api/lulu/generate-pdfs', {
  method: 'POST',
  body: JSON.stringify({ orderId })
});
// Then generate PDFs with compositor and upload
```

**Option B: Automatic background job** (requires additional setup)
- Use Vercel Cron or external service
- Poll for orders with `fulfillment_status = 'pending_pdf'`
- Generate and upload PDFs
- Submit to Lulu

### 4. Shipping Cost Display (Optional)
If you want to show real Lulu shipping costs during checkout:
```javascript
import { calculateShipping } from '../api/lulu.js';

const shipping = await calculateShipping(
  [{ sizeCode: 'square-medium', pageCount: 32, quantity: 1 }],
  { street1: '...', city: '...', postcode: '...', countryCode: 'US' }
);
// Display shipping.options to user
```

## Database Changes Required

Run `docs/supabase_lulu_migration.sql` to create:
- `lulu_print_jobs` - Tracks print job status
- `lulu_pod_packages` - Maps your sizes to Lulu SKUs  
- `lulu_webhook_events` - Logs webhooks
- New columns on `orders` and `book_exports`

## Environment Variables Required

```env
LULU_CLIENT_KEY=your_key
LULU_CLIENT_SECRET=your_secret
LULU_USE_SANDBOX=true
LULU_CONTACT_EMAIL=you@example.com
INTERNAL_API_SECRET=random_string_for_internal_calls
```

## Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Stripe webhook | ✅ Connected | Auto-queues hardcover orders |
| Lulu API client | ✅ Ready | All endpoints use it |
| Admin endpoints | ✅ Ready | Just needs UI |
| Lulu webhooks | ✅ Ready | Configure URL in Lulu dashboard |
| Database | ⚠️ Need to run | Run migration SQL |
| Admin UI | ⚠️ Need to build | Add section to admin.html |
| PDF generation | ⚠️ Manual | Need trigger mechanism |
| Env variables | ⚠️ Need to add | Add to Vercel |
