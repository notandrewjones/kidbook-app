# Lulu Print-on-Demand Integration

This document describes the integration between KidBook Creator and Lulu's Print API for fulfilling hardcover book orders.

## Overview

When a customer orders a hardcover book:
1. Customer pays via Stripe checkout
2. Stripe webhook marks order as paid
3. System queues order for print fulfillment
4. Print-ready PDFs are generated (interior + cover)
5. PDFs are uploaded to public storage
6. Print job is submitted to Lulu API
7. Lulu prints and ships the book
8. Lulu webhook updates us with tracking info
9. Customer receives their book!

## Setup

### 1. Create Lulu Developer Account

1. Go to https://developers.lulu.com/ (production) or https://developers.sandbox.lulu.com/ (testing)
2. Create an account
3. Navigate to API Keys & Secret
4. Copy your Client Key and Client Secret

### 2. Environment Variables

Add these to your Vercel environment variables:

```env
# Lulu API Credentials
LULU_CLIENT_KEY=your_client_key
LULU_CLIENT_SECRET=your_client_secret

# Use sandbox for development/testing
LULU_USE_SANDBOX=true  # Set to 'false' for production

# Contact email for print job issues
LULU_CONTACT_EMAIL=your-email@example.com

# Internal API secret for server-to-server calls
INTERNAL_API_SECRET=your_random_secret_string
```

### 3. Database Migration

Run the SQL migration in Supabase:

```bash
# Copy contents of docs/supabase_lulu_migration.sql
# Paste into Supabase SQL Editor and run
```

This creates:
- `lulu_print_jobs` - Tracks all print jobs
- `lulu_pod_packages` - Maps your sizes to Lulu SKUs
- `lulu_webhook_events` - Logs webhook events
- Adds Lulu fields to `orders` and `book_exports` tables

### 4. Set Up Lulu Webhook

1. Deploy your app to get the webhook URL
2. In Lulu Developer Portal, create a webhook:
   - URL: `https://your-domain.com/api/webhooks/lulu`
   - Topics: `PRINT_JOB_STATUS_CHANGED`
3. Save the webhook

### 5. Storage for PDFs

PDFs must be publicly accessible for Lulu to download. Options:

**Option A: Supabase Storage (Recommended for simplicity)**
1. Create a public bucket called `book-exports`
2. Configure CORS if needed

**Option B: Cloudflare R2 (Better for large files)**
```env
R2_PUBLIC_URL=https://your-bucket.r2.dev
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_BUCKET_NAME=kidbook-exports
```

## API Endpoints

### Calculate Shipping
```
POST /api/lulu/calculate-shipping
```
Calculate shipping costs for items before checkout.

**Request:**
```json
{
  "items": [
    {
      "sizeCode": "square-medium",
      "pageCount": 32,
      "quantity": 1
    }
  ],
  "shippingAddress": {
    "street1": "123 Main St",
    "city": "New York",
    "postcode": "10001",
    "countryCode": "US"
  }
}
```

**Response:**
```json
{
  "success": true,
  "options": [
    {
      "level": "MAIL",
      "name": "Standard Mail",
      "totalCostCents": 1250,
      "totalCost": "$12.50",
      "estimatedDays": "7-21 business days"
    }
  ]
}
```

### Generate PDFs
```
POST /api/lulu/generate-pdfs
```
Get PDF specifications for a book.

### Upload PDF
```
POST /api/lulu/upload-pdf?type=interior&bookId=xxx
```
Upload a print-ready PDF.

### Submit Print Job
```
POST /api/lulu/submit-print-job
```
Submit order to Lulu for printing (admin/internal only).

### Lulu Webhook
```
POST /api/webhooks/lulu
```
Receives status updates from Lulu.

### Admin: Manage Print Jobs
```
GET /api/admin/lulu-jobs
POST /api/admin/lulu-jobs
```
Admin endpoint for managing print jobs.

## Print Job Flow

### Automatic Flow (After Payment)

1. Stripe webhook fires `checkout.session.completed`
2. `handleCheckoutCompleted` updates order status to `paid`
3. For hardcover orders, `queueLuluSubmission` is called
4. Order `fulfillment_status` set to `pending_pdf`

### Manual Flow (Admin Panel)

1. Admin generates PDFs via compositor
2. Admin uploads PDFs via `/api/lulu/upload-pdf`
3. Admin submits job via `/api/admin/lulu-jobs` with action `submit`

### PDF Generation

Interior and cover PDFs must meet Lulu's specifications:

**Interior PDF:**
- All pages same size
- Minimum 2 pages
- Embedded fonts
- High resolution images (300 DPI recommended)

**Cover PDF:**
- One-piece wraparound cover
- Includes front, spine, and back
- Use Lulu's cover dimension calculator for exact size

## POD Package IDs

Lulu uses 27-character SKU codes. Our default mappings:

| Size Code | POD Package ID | Description |
|-----------|---------------|-------------|
| square-small | 0700X0700FCSTDHC080CW444GXX | 7"×7" Full Color Hardcover |
| square-medium | 0850X0850FCSTDHC080CW444GXX | 8.5"×8.5" Full Color Hardcover |
| square-large | 1000X1000FCSTDHC080CW444GXX | 10"×10" Full Color Hardcover |
| landscape-medium | 1100X0850FCSTDHC080CW444GXX | 11"×8.5" Full Color Hardcover |
| portrait-medium | 0850X1100FCSTDHC080CW444GXX | 8.5"×11" Full Color Hardcover |

**SKU Format:**
```
Trim Size + Color + Quality + Bind + Paper + PPI + Finish + Linen + Foil
0850X0850  FC      STD      HC     080CW444  G       X       X
```

## Shipping Levels

| Level | Description | Speed |
|-------|-------------|-------|
| MAIL | Standard mail, cheapest | 2-3 weeks |
| PRIORITY_MAIL | Priority with tracking | 1-2 weeks |
| GROUND | Ground courier (US) | 5-10 days |
| EXPEDITED | Air mail | 2-5 days |
| EXPRESS | Overnight where possible | 1-3 days |

## Status Mapping

| Lulu Status | Our Fulfillment Status | Description |
|-------------|------------------------|-------------|
| created | submitted | Job created |
| unpaid | submitted | Awaiting payment verification |
| production_delayed | processing | Paid, in delay period |
| production_ready | processing | About to enter production |
| in_production | printing | Being printed |
| shipped | shipped | Shipped with tracking |
| rejected | failed | File or data issues |
| canceled | cancelled | Cancelled |

## Error Handling

### File Validation Errors
If Lulu rejects files, check:
- PDF is valid and not corrupted
- All fonts are embedded
- Images are high enough resolution
- Page sizes match POD package specs

### API Errors
Common error codes:
- 400: Bad request (check payload)
- 401: Authentication failed (check credentials)
- 403: Forbidden (check permissions)
- 404: Resource not found

### Retry Logic
Failed jobs can be retried via admin panel:
1. Fix the underlying issue
2. Use "Retry" action in admin
3. This resubmits with `forceResubmit: true`

## Testing

### Sandbox Environment
1. Set `LULU_USE_SANDBOX=true`
2. Use sandbox credentials from https://developers.sandbox.lulu.com/
3. Jobs won't actually print
4. Use test credit cards for payment

### Test Webhook Locally
1. Use ngrok: `ngrok http 3000`
2. Update webhook URL in Lulu dashboard to ngrok URL
3. Create test jobs and watch logs

## Monitoring

### Check Job Status
```javascript
// From admin panel
const { data } = await fetch('/api/admin/lulu-jobs?status=in_production');
```

### Sync All Jobs
```javascript
// Force sync with Lulu
await fetch('/api/admin/lulu-jobs', {
  method: 'POST',
  body: JSON.stringify({ action: 'sync_all' })
});
```

## Troubleshooting

### Jobs Stuck in "pending_pdf"
- PDFs haven't been generated yet
- Check book_exports table for PDF paths
- Generate PDFs manually via admin

### Jobs Stuck in "pending_submission"
- Lulu API might be unreachable
- Check API credentials
- Check network connectivity
- Try manual submission via admin

### Webhook Not Receiving
- Verify webhook URL is correct
- Check webhook is active in Lulu dashboard
- Check server logs for incoming requests
- Verify HMAC signature if using

### Cover Dimensions Wrong
- Use `/api/lulu/generate-pdfs` to get exact dimensions
- Cover size depends on page count (spine width varies)
- Recalculate if page count changes

## Cost Considerations

Lulu charges per book based on:
- Book size
- Page count
- Paper type
- Color/B&W
- Binding type

Plus shipping based on:
- Destination
- Shipping speed
- Weight

Use the pricing calculator to estimate costs:
https://developers.lulu.com/price-calculator

## Support

- Lulu API Documentation: https://api.lulu.com/docs/
- Lulu Developer Portal: https://developers.lulu.com/
- Lulu Support: https://help.api.lulu.com/
