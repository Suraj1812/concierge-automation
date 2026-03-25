# AI Concierge System

AI Concierge System is a multi-tenant backend for running concierge operations across WhatsApp and email. It accepts inbound customer requests, uses OpenAI to structure them, matches vendors, normalizes quotes, generates proposal PDFs, creates Razorpay payment orders, and turns captured payments into bookings with automated follow-ups.

Important notes:

- Backend only. There is no customer UI or admin frontend in this repository.
- The default production shape is API plus worker as separate processes.
- MongoDB stores business state. Redis powers BullMQ queues when queue mode is enabled.
- The system can also run fully standalone with `DISABLE_QUEUE_BACKEND=true`.
- The repo does not use `tsx`. Development and production both run compiled JavaScript.

## What the system does end to end

1. A customer sends a message on WhatsApp or an inbound email webhook hits the API.
2. The API verifies the webhook signature, resolves the tenant, deduplicates the event, and either enqueues work or runs it inline.
3. The worker or inline processor upserts the customer, loads the active conversation and enquiry, and calls OpenAI for structured extraction.
4. If details are missing, the system sends a clarification reply and schedules a follow-up reminder.
5. If the request is complete, the system matches vendors, creates vendor requests, and dispatches outreach over WhatsApp or email.
6. Vendor replies enter through the vendor webhook, are mapped back to the open vendor request, and become quotes.
7. The worker or inline processor normalizes raw quotes with OpenAI and ranks them with the decision engine.
8. When vendor collection is complete or follow-ups time out, the system generates a proposal PDF, stores it under `storage/proposals`, and sends a share link plus proposal message to the customer.
9. An admin creates a Razorpay order for the proposal.
10. When Razorpay sends a `payment.captured` webhook, the system creates or updates the booking, notifies the customer and vendor, and schedules reminder/check-in/follow-up jobs.
11. Dashboard, audit, conversation, email, enquiry, booking, payment, and proposal data remain queryable through admin APIs.

## High-level architecture

```mermaid
flowchart LR
  Customer["Customer"] --> Channels["WhatsApp / Email"]
  Channels --> API["Express API"]
  API --> Mongo["MongoDB"]
  API --> Redis["Redis / BullMQ (optional)"]
  API --> Webhooks["Webhook verification + dedupe"]
  Webhooks --> Queues["Queues / Inline execution"]
  Queues --> Worker["Worker process (optional)"]
  Worker --> AI["OpenAI"]
  Worker --> Vendors["Vendor outreach"]
  Worker --> PDF["PDF generator"]
  Worker --> Razorpay["Razorpay"]
  Worker --> Notifications["WhatsApp / Email notifications"]
```

## Where things live

- HTTP entrypoint: `src/app.ts`
- API server bootstrap: `src/server.ts`
- Worker bootstrap: `src/worker.ts`
- Route registry: `src/routes.ts`
- Dependency wiring: `src/container.ts`
- Environment validation: `src/config/env.ts`
- Startup and shutdown lifecycle: `src/infrastructure/runtime/*`
- Tenant context and runtime config: `src/infrastructure/tenancy/*`, `src/modules/tenants/*`
- Queue definitions: `src/infrastructure/queue/queues.ts`
- Queue registry and inline execution: `src/infrastructure/queue/registry.ts`
- Worker handlers: `src/workers/index.ts`
- WhatsApp intake and delivery: `src/modules/integrations/whatsapp.*`
- Email intake and delivery: `src/modules/emails/*`, `src/modules/integrations/email.service.ts`
- Conversation orchestration: `src/modules/conversations/*`
- Enquiry lifecycle: `src/modules/enquiries/*`
- Vendor matching and vendor responses: `src/modules/vendors/*`
- Quote normalization and ranking: `src/modules/quotes/*`
- Proposal generation and PDF sharing: `src/modules/proposals/*`
- Payments and Razorpay webhooks: `src/modules/payments/*`
- Booking lifecycle: `src/modules/bookings/*`
- Notifications: `src/modules/notifications/*`
- Logging, metrics, error capture: `src/infrastructure/http/*`, `src/infrastructure/logging/*`, `src/infrastructure/observability/*`
- End-to-end verification: `tests/e2e-smoke.ts`, `tests/hardening.integration.ts`

## Core capabilities

- Multi-tenant runtime with tenant-scoped data, credentials, feature flags, pricing, automation, and branding.
- WhatsApp Cloud API webhook verification and outbound text/document messaging.
- Email inbound automation and outbound SMTP responses.
- OpenAI JSON-based extraction for enquiry creation/update, quote normalization, and proposal copy.
- Vendor matching, dispatch, retry, and follow-up automation.
- Proposal PDF generation and signed share links.
- Razorpay order creation, webhook verification, retry reminders, and booking conversion.
- Dashboard endpoints for overview, funnel, and recent activity.
- JWT admin authentication, rate limiting, idempotent write endpoints, webhook dedupe, audit logs, metrics, and correlation IDs.

## Prerequisites

- Node.js `>=20.11.0`
- npm
- MongoDB
- Redis for BullMQ mode
- Docker Desktop if you want MongoDB and Redis locally via `docker compose`
- Real provider credentials if you want live WhatsApp, OpenAI, Razorpay, or SMTP behavior

## Quick start

### Option A: Run API and worker locally against Dockerized MongoDB + Redis

```bash
cp .env.example .env
npm install
open -a Docker
docker compose up -d mongo redis
npm run build
npm start
```

Run the worker in a second terminal:

```bash
npm run start:worker
```

### Option B: Hot reload during development

```bash
cp .env.example .env
npm install
open -a Docker
docker compose up -d mongo redis
npm run dev
```

Run the worker dev loop in a second terminal:

```bash
npm run dev:worker
```

### Option C: Run fully standalone without Redis or a worker

Use this when you want the backend to orchestrate itself without n8n and without a separate worker process.

1. Set `DISABLE_QUEUE_BACKEND=true` in `.env`
2. Start only MongoDB
3. Run only the API process

```bash
cp .env.example .env
npm install
open -a Docker
docker compose up -d mongo
npm run build
npm start
```

In this mode:

- Redis is not required
- `npm run start:worker` is not required
- queue jobs execute inline in the API process
- connector endpoints still work

### Option D: Run the whole stack in Docker Compose

```bash
cp .env.example .env
open -a Docker
docker compose up -d --build api worker mongo redis
```

### After startup

- API base URL: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`
- Live check: `http://localhost:4000/api/health/live`
- Ready check: `http://localhost:4000/api/health/ready`
- Metrics: `http://localhost:4000/api/health/metrics`

Health semantics:

- In BullMQ mode, readiness requires both MongoDB and Redis.
- In standalone inline mode, readiness requires MongoDB and reports Redis as `disabled`.

## Bootstrap behavior

On API startup the server automatically does two bootstrap steps:

1. Seeds a default tenant using `DEFAULT_TENANT_SLUG`, `DEFAULT_TENANT_NAME`, and the current integration/env defaults.
2. Seeds a default super admin user using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_NAME`.

That means a clean local database becomes usable as soon as the API starts successfully.

If you do not pass a tenant slug during admin login and you do not use a tenant-specific webhook path, the system falls back to `DEFAULT_TENANT_SLUG`.

## Environment variables

The example `.env.example` is bootable for local development. It lets the app start without a real OpenAI key in non-production, but real AI, WhatsApp, payment, and email traffic still requires real credentials.

### App and bootstrap

| Variable | Purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `development`, `test`, or `production` |
| `APP_PORT` | HTTP port | Defaults to `4000`; falls back to Railway `PORT` when present |
| `APP_NAME` | App display name | Used in logs |
| `APP_BASE_URL` | Public base URL | Used to build proposal share links; falls back to `https://RAILWAY_PUBLIC_DOMAIN` when available |
| `DEFAULT_TENANT_SLUG` | Fallback tenant slug | Default `default` |
| `DEFAULT_TENANT_NAME` | Fallback tenant name | Default `Default Tenant` |
| `AUTOMATION_API_KEY` | Shared secret for connector endpoints | Use this from n8n, Make, Zapier, or custom apps |
| `JWT_SECRET` | JWT signing secret | Must be strong in production |
| `JWT_EXPIRES_IN` | Token lifetime | Default `8h` |
| `ADMIN_EMAIL` | Seeded admin email | Required |
| `ADMIN_PASSWORD` | Seeded admin password | Required |
| `ADMIN_NAME` | Seeded admin name | Required |

### Data and storage

| Variable | Purpose | Notes |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB connection string | Required |
| `REDIS_HOST` | Redis host | Required unless you provide `REDIS_URL` |
| `REDIS_PORT` | Redis port | Default `6379` |
| `REDIS_PASSWORD` | Redis password | Optional |
| `DISABLE_QUEUE_BACKEND` | Disable BullMQ and run jobs inline in the API process | Default `false`; useful for standalone mode |
| `PDF_STORAGE_PATH` | Proposal PDF directory | Default `storage/proposals` |

### AI

| Variable | Purpose | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API key | Non-production default exists only for local boot |
| `OPENAI_MODEL` | Chat completion model | Default `gpt-4.1-mini` |

### WhatsApp Cloud API

| Variable | Purpose | Notes |
| --- | --- | --- |
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook verify token | Must match Meta webhook config |
| `WHATSAPP_APP_SECRET` | Signature validation secret | Used for `x-hub-signature-256` |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number id | Used for outbound Graph API calls |
| `WHATSAPP_ACCESS_TOKEN` | Meta access token | Used for outbound Graph API calls |
| `WHATSAPP_API_VERSION` | Graph API version | Default `v21.0` |

### Vendor automation webhook

| Variable | Purpose | Notes |
| --- | --- | --- |
| `VENDOR_WEBHOOK_SECRET` | HMAC secret for vendor reply webhook | Used for `x-vendor-signature` |

### Razorpay

| Variable | Purpose | Notes |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | Razorpay key id | Returned by payment order endpoint |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret | Used to create orders |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook HMAC secret | Used for `x-razorpay-signature` |
| `DEFAULT_CURRENCY` | Default currency fallback | Also used in proposal defaults |

### Email

| Variable | Purpose | Notes |
| --- | --- | --- |
| `SMTP_HOST` | SMTP host | If blank, outbound email becomes a no-op |
| `SMTP_PORT` | SMTP port | Default `587` |
| `SMTP_SECURE` | SMTP secure mode | `true` or `false` |
| `SMTP_USER` | SMTP username | Optional |
| `SMTP_PASS` | SMTP password | Optional |
| `SMTP_FROM` | Default from address | Used for outbound email |
| `EMAIL_WEBHOOK_SECRET` | HMAC secret for inbound email webhook | Used for `x-email-signature` |

### Automation and timing

| Variable | Purpose | Notes |
| --- | --- | --- |
| `MAX_VENDOR_RETRY_ATTEMPTS` | Max vendor follow-up attempts | Used by vendor follow-up worker |
| `VENDOR_RESPONSE_TIMEOUT_MINUTES` | Vendor response window | Also controls follow-up delay |
| `PAYMENT_LINK_EXPIRY_MINUTES` | Payment order expiration window | Used for reminders and retries |
| `MAX_PAYMENT_RETRY_ATTEMPTS` | Max payment retry orders | Used by payment automation |
| `CUSTOMER_FOLLOW_UP_MINUTES` | Delay for clarification and proposal follow-up | Used by customer follow-up queue |
| `SERVICE_REMINDER_HOURS_BEFORE` | Customer and vendor reminder lead time | Used when scheduling bookings |
| `POST_SERVICE_FOLLOW_UP_HOURS_AFTER` | Delay after service end | Used to mark booking complete and follow up |

### Rate limiting and logs

| Variable | Purpose | Notes |
| --- | --- | --- |
| `RATE_LIMIT_WINDOW_MS` | Global API rate limit window | Webhooks use a higher multiplier |
| `RATE_LIMIT_MAX_REQUESTS` | Global API request cap | Auth has its own stricter cap |
| `LOG_LEVEL` | Winston log level | Example: `info`, `error` |

### Test helper

| Variable | Purpose | Notes |
| --- | --- | --- |
| `TEST_WHATSAPP_RECIPIENT` | Seed helper default phone number | Used by `npm run seed:test-whatsapp` |
| `TEST_WHATSAPP_NAME` | Seed helper default name | Optional |

## NPM scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Watches TypeScript, rebuilds, and restarts the API server |
| `npm run dev:worker` | Watches TypeScript, rebuilds, and restarts the worker |
| `npm run build` | Compiles the project to `dist/` |
| `npm start` | Starts the compiled API server |
| `npm run start:worker` | Starts the compiled worker |
| `npm run seed:test-whatsapp` | Builds the project and seeds one WhatsApp customer into the default tenant |
| `npm run lint` | Type-checks without emitting |
| `npm run test:connectors` | Runs connector endpoint integration coverage |
| `npm run test:smoke` | Runs the smoke integration flow |
| `npm run test:hardening` | Runs duplicate-handling and proposal-link hardening flow |

## API conventions

- All routes live under `/api`.
- Successful JSON responses use `{ "success": true, "data": ... }`.
- Validation and application errors return `{ "success": false, "code": "...", "message": "...", "correlationId": "..." }`.
- Every request gets an `x-correlation-id` response header.
- Authenticated routes require `Authorization: Bearer <token>`.
- Connector routes accept either `Authorization: Bearer <AUTOMATION_API_KEY>` or `x-automation-key: <AUTOMATION_API_KEY>`.
- Mutating admin routes use `Idempotency-Key` and reject missing or conflicting re-use.
- Public webhooks can resolve tenancy from `:tenantSlug`, the `x-tenant-slug` header, or the default tenant.

Write endpoints that currently require `Idempotency-Key`:

- `POST /api/vendors`
- `PATCH /api/vendors/:vendorId`
- `POST /api/quotes`
- `POST /api/proposals/generate`
- `POST /api/payments/orders`
- `PATCH /api/bookings/:bookingId`

## Supported service types and lifecycle states

### Service types

`luxury_hotel`, `private_jet`, `yacht`, `villa`, `restaurant`, `chauffeur`, `event`, `bespoke`

### Enquiry statuses

`new`, `awaiting_clarification`, `vendor_matching`, `awaiting_vendor_quotes`, `quote_normalizing`, `proposal_ready`, `proposal_sent`, `payment_pending`, `payment_authorized`, `booked`, `completed`, `cancelled`, `stalled`

### Conversation states

`collecting_requirements`, `awaiting_clarification`, `vendor_discovery`, `proposal_presented`, `payment_collection`, `booking_confirmed`

### Booking statuses

`pending_payment`, `confirmed`, `vendor_confirmed`, `in_progress`, `completed`, `cancelled`

## Route map

### Public and webhook endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Snapshot of Mongo, Redis, queue mode, and uptime |
| `GET` | `/api/health/live` | Liveness probe |
| `GET` | `/api/health/ready` | Readiness probe; returns `503` if Mongo is not ready, or if BullMQ mode is enabled and Redis is not ready |
| `GET` | `/api/health/metrics` | Prometheus-style metrics |
| `GET` | `/api/webhooks/whatsapp` | Meta webhook verification for the default tenant |
| `GET` | `/api/webhooks/:tenantSlug/whatsapp` | Meta webhook verification for a specific tenant |
| `POST` | `/api/webhooks/whatsapp` | Inbound WhatsApp message webhook for the default tenant |
| `POST` | `/api/webhooks/:tenantSlug/whatsapp` | Inbound WhatsApp message webhook for a specific tenant |
| `POST` | `/api/webhooks/vendor-responses` | Vendor reply webhook for the default tenant |
| `POST` | `/api/webhooks/:tenantSlug/vendor-responses` | Vendor reply webhook for a specific tenant |
| `POST` | `/api/webhooks/emails` | Inbound email webhook for the default tenant |
| `POST` | `/api/webhooks/:tenantSlug/emails` | Inbound email webhook for a specific tenant |
| `POST` | `/api/payments/webhook` | Razorpay webhook for the default tenant |
| `POST` | `/api/payments/webhook/:tenantSlug` | Razorpay webhook for a specific tenant |
| `GET` | `/api/proposals/shared/:proposalId/document?token=...` | Public proposal PDF access with a signed token |

### Connector endpoints

These are the automation-friendly routes for n8n, Make, Zapier, custom CRMs, forms, chat frontends, or other systems that cannot produce Meta/Razorpay signature headers.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/connectors/health` | Connector auth and tenant sanity check for the default tenant |
| `GET` | `/api/connectors/:tenantSlug/health` | Connector auth and tenant sanity check for a specific tenant |
| `POST` | `/api/connectors/whatsapp/inbound` | Queue an inbound WhatsApp-style customer message for the default tenant |
| `POST` | `/api/connectors/:tenantSlug/whatsapp/inbound` | Queue an inbound WhatsApp-style customer message for a specific tenant |
| `POST` | `/api/connectors/email/inbound` | Process an inbound email payload for the default tenant |
| `POST` | `/api/connectors/:tenantSlug/email/inbound` | Process an inbound email payload for a specific tenant |
| `POST` | `/api/connectors/vendor-responses/inbound` | Ingest a vendor response payload for the default tenant |
| `POST` | `/api/connectors/:tenantSlug/vendor-responses/inbound` | Ingest a vendor response payload for a specific tenant |

### Admin endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Admin login; accepts optional `tenantSlug` |
| `GET` | `/api/tenants/current` | Current tenant from the JWT |
| `GET` | `/api/tenants` | List all tenants; super admin only |
| `POST` | `/api/tenants` | Create tenant; super admin only |
| `PATCH` | `/api/tenants/:tenantId` | Update tenant; super admin only |
| `GET` | `/api/dashboard/overview` | Top-level counts and revenue |
| `GET` | `/api/dashboard/funnel` | Funnel counts by enquiry stage |
| `GET` | `/api/dashboard/activity` | Recent audit activity |
| `GET` | `/api/vendors` | List vendors |
| `POST` | `/api/vendors` | Create vendor |
| `PATCH` | `/api/vendors/:vendorId` | Update vendor |
| `GET` | `/api/enquiries` | List enquiries |
| `GET` | `/api/enquiries/:enquiryId` | Get one enquiry |
| `GET` | `/api/quotes?enquiryId=...` | List quotes for one enquiry |
| `POST` | `/api/quotes` | Manually create a quote |
| `POST` | `/api/proposals/generate` | Generate proposal now; may return `202` if vendor collection is still open |
| `GET` | `/api/proposals/:proposalId` | Get one proposal |
| `POST` | `/api/payments/orders` | Create or reuse a Razorpay order |
| `GET` | `/api/bookings` | List bookings |
| `PATCH` | `/api/bookings/:bookingId` | Update booking status or notes |
| `GET` | `/api/conversations` | List conversations |
| `GET` | `/api/emails` | List stored email messages |
| `GET` | `/api/audit-logs` | List audit log records |

## Webhook signature rules

| Webhook | Header | Expected format |
| --- | --- | --- |
| WhatsApp | `x-hub-signature-256` | `sha256=<hex(hmac_sha256(rawBody, WHATSAPP_APP_SECRET))>` |
| Vendor replies | `x-vendor-signature` | `sha256=<hex(hmac_sha256(rawBody, VENDOR_WEBHOOK_SECRET or tenant config secret))>` |
| Inbound email | `x-email-signature` | `sha256=<hex(hmac_sha256(rawBody, EMAIL_WEBHOOK_SECRET or tenant config secret))>` |
| Razorpay | `x-razorpay-signature` | `<hex(hmac_sha256(rawBody, RAZORPAY_WEBHOOK_SECRET or tenant config secret))>` |

## Minimal admin flow

### 1. Login

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "change-me"
  }'
```

Save the returned token and use it as `Authorization: Bearer <token>`.

### 2. Create a vendor

```bash
curl -X POST http://localhost:4000/api/vendors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: vendor-create-1" \
  -d '{
    "name": "Azure Palm Villas",
    "categories": ["villa"],
    "supportedServices": ["villa"],
    "geoCoverage": ["Dubai"],
    "capabilities": ["beachfront", "private chef"],
    "contactPoints": [
      {
        "channel": "email",
        "value": "reservations@azurepalm.example"
      }
    ],
    "rating": 4.8,
    "responseSlaHours": 2,
    "priorityWeight": 2,
    "isActive": true
  }'
```

### 3. List enquiries

```bash
curl http://localhost:4000/api/enquiries \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Create a payment order once a proposal exists

```bash
curl -X POST http://localhost:4000/api/payments/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: payment-order-1" \
  -d '{
    "enquiryId": "ENQUIRY_ID",
    "proposalId": "PROPOSAL_ID"
  }'
```

The payment order response returns `paymentId`, `orderId`, `amount`, `currency`, and `keyId`. This repo does not include a checkout UI, so you need your own client or a simulated webhook to complete the Razorpay flow.

## Connector API for n8n and other tools

Use the connector API when your external tool cannot send Meta, email-provider, vendor, or Razorpay webhook signatures. These routes are authenticated with `AUTOMATION_API_KEY` instead of HMAC signatures and are safe for retried automation runs because they are deduplicated by event id where applicable.

### Auth header

Use one of these:

- `Authorization: Bearer YOUR_AUTOMATION_API_KEY`
- `x-automation-key: YOUR_AUTOMATION_API_KEY`

### Tenant selection

Choose one of these patterns:

- Default tenant:
  - `/api/connectors/...`
- Specific tenant:
  - `/api/connectors/YOUR_TENANT_SLUG/...`
- Or use the `x-tenant-slug` header with the non-slug path

### n8n-ready examples

#### 1. Health check

```bash
curl http://localhost:4000/api/connectors/health \
  -H "Authorization: Bearer dev-automation-key-change-me"
```

#### 2. Queue a WhatsApp-style message

```bash
curl -X POST http://localhost:4000/api/connectors/whatsapp/inbound \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-automation-key-change-me" \
  -d '{
    "phone": "+919625553534",
    "name": "Suraj",
    "message": "I need a villa in Dubai",
    "messageId": "n8n-msg-001"
  }'
```

Payload shape:

```json
{
  "phone": "+919625553534",
  "name": "Suraj",
  "message": "I need a villa in Dubai",
  "whatsappUserId": "optional-external-user-id",
  "messageId": "optional-stable-event-id"
}
```

Notes:

- `messageId` is optional but strongly recommended so retries from n8n stay idempotent.
- In BullMQ mode, this endpoint queues work and the worker must be running.
- In standalone mode (`DISABLE_QUEUE_BACKEND=true`), the API process executes the queued work inline.

#### 3. Send an inbound email payload

```bash
curl -X POST http://localhost:4000/api/connectors/email/inbound \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-automation-key-change-me" \
  -d '{
    "from": "client@example.com",
    "subject": "Need a Dubai villa",
    "text": "We need a premium Dubai villa for 6 guests.",
    "providerMessageId": "n8n-email-001"
  }'
```

Payload shape:

```json
{
  "from": "client@example.com",
  "to": "optional-recipient@example.com",
  "subject": "Need a Dubai villa",
  "text": "We need a premium Dubai villa for 6 guests.",
  "providerMessageId": "optional-stable-event-id"
}
```

Notes:

- If `to` is omitted, the tenant email `fromAddress` or `SMTP_FROM` is used.
- `providerMessageId` is optional but recommended for retry-safe dedupe.

#### 4. Send a vendor response

```bash
curl -X POST http://localhost:4000/api/connectors/vendor-responses/inbound \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-automation-key-change-me" \
  -d '{
    "externalEventId": "n8n-vendor-001",
    "vendorReference": "VR-ABCDEFGH",
    "rawPayload": "Reference: VR-ABCDEFGH\nWe can offer a premium villa for INR 38,50,000."
  }'
```

Payload shape:

```json
{
  "externalEventId": "optional-stable-event-id",
  "vendorReference": "optional-vendor-reference",
  "vendorId": "optional-vendor-id",
  "enquiryId": "optional-enquiry-id",
  "rawPayload": "Reference: VR-ABCDEFGH\nWe can offer a premium villa for INR 38,50,000.",
  "expiresAt": "optional-iso-datetime"
}
```

Notes:

- Include `vendorReference` when possible. It is the most reliable way to map the reply.
- If `externalEventId` is omitted, the system hashes the full payload for dedupe.

### n8n HTTP Request node settings

For n8n, use:

- Method: `POST`
- Authentication: `None`
- Header 1: `Authorization` = `Bearer YOUR_AUTOMATION_API_KEY`
- Header 2: `Content-Type` = `application/json`
- URL:
  - `http://localhost:4000/api/connectors/whatsapp/inbound`
  - or `http://localhost:4000/api/connectors/YOUR_TENANT_SLUG/whatsapp/inbound`
- Send Body: `true`
- Body Content Type: `JSON`

Important:

- Do not send `x-hub-signature-256` to the connector route.
- Do not use `/api/webhooks/whatsapp` from n8n unless you are forwarding the exact Meta payload with a valid Meta signature.
- In BullMQ mode, run both the API and the worker.
- In standalone mode, run only the API.

## End-to-end flows

### WhatsApp flow

1. Meta sends an inbound webhook to `/api/webhooks/whatsapp` or `/api/webhooks/:tenantSlug/whatsapp`.
2. The API verifies the signature and deduplicates by WhatsApp message id.
3. The system upserts the customer from the sender phone number.
4. The worker loads the active conversation and latest active enquiry in parallel.
5. OpenAI returns:
   - `replyText`
   - `summary`
   - `title`
   - `serviceType`
   - structured `extractedRequirements`
   - `missingFields`
   - `nextState`
   - `nextAction`
   - optional memory update
6. The system stores the inbound and outbound conversation turns.
7. If required fields are missing, it replies with a clarification message and schedules a follow-up job.
8. If the enquiry is complete, it matches vendors and dispatches outreach.

### Email flow

1. Your email provider posts to `/api/webhooks/emails` or `/api/webhooks/:tenantSlug/emails`.
2. The API verifies `x-email-signature`.
3. The system upserts the customer by email address.
4. OpenAI processes the subject and email body.
5. The system creates or updates the enquiry, stores inbound email, sends an outbound reply, stores that outbound email, and optionally starts vendor matching.
6. Email automation is blocked if the tenant feature flag `emailAutomation` is disabled.

### Vendor and quote flow

1. Vendor matching looks at service type, destination, preferences, rating, priority weight, and response SLA.
2. The top matches are stored on the enquiry and converted into `VendorRequest` records.
3. Outreach is sent over the vendor's preferred configured channel, usually WhatsApp or email.
4. Each vendor request gets a `vendorReference` so inbound replies can be mapped back reliably.
5. Vendor responses arrive through the vendor webhook and become `Quote` records.
6. Quote normalization uses OpenAI to extract price, inclusions, exclusions, availability, terms, and summary.
7. When no open vendor requests remain, proposal generation is queued automatically.

### Proposal flow

1. The decision engine ranks normalized quotes by:
   - price score
   - fit score
   - vendor reliability
   - response speed
2. The highest ranked quote becomes the recommended option.
3. Proposal copy is generated with OpenAI.
4. A PDF is written to `PDF_STORAGE_PATH`.
5. A public share link is created using `APP_BASE_URL` plus an access token hash stored in MongoDB.
6. The enquiry moves to `proposal_sent`.
7. The customer receives a WhatsApp text plus a WhatsApp document message when a phone number exists.
8. If a newer proposal is generated for the same enquiry, the previous proposal is marked `superseded`.

### Payment flow

1. Admin calls `POST /api/payments/orders`.
2. The service loads the proposal, enquiry, recommended quote, customer, and tenant pricing.
3. It computes the payable amount as `quote total + service fee`.
4. It creates a Razorpay order.
5. It stores the payment as `pending`, updates the enquiry to `payment_pending`, sends the customer a WhatsApp payment message, and schedules a reminder job.
6. If there is already an active pending order for that proposal, the endpoint returns the existing order instead of creating a new one.
7. If a payment fails or expires, the payment worker can create a fresh order until the configured retry limit is reached.

### Booking flow

1. Razorpay sends `payment.captured` to the webhook.
2. The API verifies the signature and deduplicates the event.
3. The payment is marked `captured`, the enquiry is updated to `payment_authorized`, and a booking-lifecycle job is queued.
4. The booking worker creates or updates a `Booking`.
5. The enquiry moves to `booked`.
6. Customer and vendor confirmation notifications are sent.
7. The worker schedules:
   - service reminder
   - day-of-service check-in
   - post-service follow-up
8. The post-service follow-up marks the booking `completed`.

## Real WhatsApp testing

Seeding a number and running the server is not enough by itself. Real WhatsApp testing requires Meta configuration.

If you are testing through n8n or another automation tool instead of Meta, use the connector route above, not `/api/webhooks/whatsapp`.

### Seed a local customer record

```bash
npm run seed:test-whatsapp
```

Or pass values explicitly:

```bash
npm run seed:test-whatsapp -- +9198XXXXXXXX "Your Name"
```

What this does:

- Creates or updates a customer in MongoDB under the default tenant.
- It does not register your number with Meta.
- It does not send a WhatsApp message by itself.

### To receive real WhatsApp traffic on your phone

1. Put real Meta credentials in `.env`.
2. Start MongoDB, Redis, API, and worker.
3. Expose your API publicly with a tunnel or a deployed URL.
4. In Meta, set the callback URL to:
   - `https://YOUR_PUBLIC_URL/api/webhooks/whatsapp`
   - or `https://YOUR_PUBLIC_URL/api/webhooks/YOUR_TENANT_SLUG/whatsapp`
5. Set the verify token in Meta to the same value as `WHATSAPP_VERIFY_TOKEN`.
6. If you use Meta's test sender number, add your personal number as an allowed recipient in Meta.
7. Message the connected business or test number from your phone.
8. Watch API and worker logs, then inspect `GET /api/enquiries`, `GET /api/conversations`, and `GET /api/audit-logs`.

## Email testing

1. Configure `SMTP_*`, `SMTP_FROM`, and `EMAIL_WEBHOOK_SECRET`.
2. Make sure the tenant has `featureFlags.emailAutomation = true`.
3. POST a signed payload to `/api/webhooks/emails` or the tenant-specific email webhook.
4. The system will:
   - upsert the customer by email
   - create or update the enquiry
   - store inbound and outbound email messages
   - reply over SMTP when a transporter is configured
   - optionally start vendor matching

Inbound email payload shape:

```json
{
  "from": "customer@example.com",
  "to": "concierge@example.com",
  "subject": "Need a villa in Dubai",
  "text": "I need a 3-night luxury villa for 6 guests next month.",
  "providerMessageId": "provider-message-123"
}
```

## Multi-tenancy

This project is already structured as a multi-tenant backend.

### How tenancy is resolved

- Admin routes use `tenantId` from the JWT.
- Public webhooks use `:tenantSlug`, `x-tenant-slug`, or the default tenant.
- Queue jobs carry `tenantId` so workers or inline processors can restore the correct context.
- Runtime config is resolved per tenant and cached in the tenant context.

### What is tenant configurable

- AI tone, fallback reply, clarification strategy, and guardrails
- Proposal branding and PDF metadata
- Automation limits and timings
- Pricing rules and service fee logic
- WhatsApp credentials
- Razorpay credentials
- Email settings
- Vendor webhook secret

### Tenant admin endpoints

- `GET /api/tenants/current`
- `GET /api/tenants`
- `POST /api/tenants`
- `PATCH /api/tenants/:tenantId`

`POST /api/auth/login` accepts an optional `tenantSlug` if you want to log into a non-default tenant.

## Queue and worker model

The codebase supports two queue execution modes.

### Mode 1: BullMQ mode

This is the default and the intended production shape for scale.

- Redis is required
- the API enqueues jobs
- the worker consumes jobs
- API and worker can scale independently

### Mode 2: Inline mode

Enable this with `DISABLE_QUEUE_BACKEND=true`.

- Redis is not required
- there is no separate worker
- jobs execute in-process inside the API runtime
- local demos, low-volume single-process deployments, and simple automation setups can run end to end without n8n or a worker

The API is intentionally short-lived in BullMQ mode. In inline mode, the same orchestration runs inside the API process.

| Queue | Main job names | Purpose | Worker concurrency |
| --- | --- | --- | --- |
| `conversation-processing` | `whatsapp-inbound` | Intake and AI conversation handling | `15` |
| `customer-follow-up` | `conversation-clarification-follow-up`, `proposal-review-follow-up` | Customer reminders | `10` |
| `vendor-outreach` | `vendor-outreach` | Initial vendor dispatch | `10` |
| `vendor-follow-up` | `vendor-follow-up` | Vendor retry and timeout logic | `10` |
| `quote-normalization` | `quote-normalization` | Normalize raw quotes with AI | `10` |
| `proposal-generation` | `proposal-generation` | Rank quotes and create proposals | `5` |
| `notifications` | varies by notification type | Send WhatsApp or email notifications | `20` |
| `booking-lifecycle` | `payment-captured`, `service-reminder`, `day-of-service-checkin`, `post-service-follow-up` | Booking confirmation and lifecycle jobs | `10` |
| `payments` | `payment-reminder` | Payment reminder and retry logic | `10` |
| `dead-letter` | `dead-letter` | Failed job capture after retries are exhausted | n/a |

Notes:

- Jobs retry with exponential backoff.
- When a worker exhausts retries, the job metadata is copied into the dead-letter queue.
- In inline mode, `jobId` is still used to deduplicate scheduled work where applicable.
- Inline timers are cleared during shutdown so delayed jobs do not outlive the process.
- Inline mode is valid for standalone operation, but BullMQ mode is still the better choice for scale and isolation.

## Data model

Main persisted collections:

- `Tenant`: tenant slug, status, feature flags, runtime config.
- `AdminUser`: admin credentials, role, last login, active state.
- `Customer`: WhatsApp and email identity, memory summary, preferences.
- `Conversation`: inbound and outbound history, state, pending clarifications, linked enquiry.
- `Enquiry`: structured customer request, requirements, stage, vendor matches, proposal, payment, and booking linkage.
- `Vendor`: capabilities, coverage, channels, rating, SLA, priority.
- `VendorRequest`: one vendor outreach record per vendor and enquiry attempt.
- `Quote`: raw vendor response plus normalized commercial structure.
- `Proposal`: recommended quote, summary, premium message, PDF path, access token hash, version.
- `Payment`: Razorpay order state, retries, webhook events, expiry.
- `Booking`: confirmed service window, references, vendor, customer, and payment linkage.
- `Notification`: outbound message and email queue state.
- `AuditLog`: immutable activity trail.
- `WebhookReceipt`: replay protection for inbound provider events.
- `IdempotencyKey`: replay protection for admin writes.
- `EmailMessage`: stored inbound and outbound email history.
- `UsageEvent`: usage tracking for dashboards and future billing.

## Security and reliability features

- Zod request validation on webhooks and admin write endpoints.
- JWT auth and role checks, including `super_admin`-only tenant administration.
- HMAC webhook verification for WhatsApp, vendor replies, email, and Razorpay.
- Idempotency-key enforcement on mutating admin routes.
- Webhook deduplication via `WebhookReceipt`.
- Tenant-aware data isolation and queue context restoration.
- Global API rate limiting, separate auth rate limiting, and higher-throughput webhook rate limits.
- Centralized JSON error responses with correlation ids.
- Request logging plus in-process metrics export.
- Circuit breaker and timeout wrappers around OpenAI, WhatsApp, and Razorpay interactions.
- Transient retry handling around OpenAI, WhatsApp, Razorpay, and SMTP send operations.
- Process-level shutdown guards for `unhandledRejection` and `uncaughtException`.
- Safer idempotency persistence so replay metadata is recorded without introducing new unhandled promise paths.
- Queue cleanup on shutdown for inline delayed jobs.
- Cached tenant config and cached SMTP transport reuse with TTL-based eviction.
- Background retries plus dead-letter capture when job attempts are exhausted.

## Automated verification

The fastest way to prove the internal orchestration works is the built-in test suite.

```bash
npm run lint
npm run test:connectors
npm run test:smoke
npm run test:hardening
```

### What the connector test covers

`tests/connectors.integration.ts` verifies:

- connector auth
- connector health route
- WhatsApp connector enqueue flow
- email connector ingestion flow
- vendor-response connector ingestion flow
- duplicate handling for all three connector entry paths

### What the smoke test covers

`tests/e2e-smoke.ts` verifies the happy path:

1. Seed admin.
2. Login.
3. Create a vendor.
4. Simulate inbound WhatsApp.
5. Create an enquiry.
6. Dispatch vendor outreach.
7. Simulate vendor reply.
8. Normalize quote.
9. Generate proposal.
10. Create payment order.
11. Simulate `payment.captured`.
12. Create booking.
13. Run service reminder, day-of-service check-in, and post-service follow-up.
14. Assert notifications and final completed booking state.

### What the hardening test covers

`tests/hardening.integration.ts` verifies resilience behavior:

- duplicate WhatsApp inbound messages do not create duplicate enquiries or replies
- duplicate vendor replies do not create duplicate quotes
- proposal document links require the correct token
- duplicate Razorpay capture webhooks do not create duplicate bookings

Important:

- These tests stub OpenAI, WhatsApp, email, and Razorpay behavior.
- They verify your orchestration and state transitions, not your live third-party credentials.

## Docker and deployment

### Dockerfile

The `Dockerfile` compiles the app in a build stage and runs compiled JavaScript in the runtime stage.

- API command: `APP_PROCESS=server`
- Worker command: `APP_PROCESS=worker`

### Railway

Railway can deploy this repo directly from the root `Dockerfile`.

Recommended production shape:

- Create one Railway service for the API with public networking enabled and `APP_PROCESS=server`
- Create a second Railway service for the worker with `APP_PROCESS=worker`
- Attach both services to the same MongoDB and Redis

Single-service fallback:

- Set `DISABLE_QUEUE_BACKEND=true`
- Deploy only the API service
- Skip the separate worker and Redis if you accept inline processing

Railway notes:

- Railway injects `PORT`; the app now uses it automatically if `APP_PORT` is not set
- If the API service has a Railway public domain, the app can derive `APP_BASE_URL` from `RAILWAY_PUBLIC_DOMAIN`
- The app can also derive `MONGODB_URI` from `MONGO_URL` or `DATABASE_URL`, and Redis settings from `REDIS_URL`
- Proposal PDFs are still written to local disk under `storage/proposals`, so treat Railway storage as ephemeral unless you add a volume or move files to object storage later
- Use `/api/health/ready` for the API health check
- Use `/api/webhooks/whatsapp` as the Meta callback path once the API service has a public HTTPS domain

### Docker Compose services

- `api`: Express API server
- `worker`: BullMQ worker
- `mongo`: MongoDB
- `redis`: Redis

Compose mounts:

- `./storage` -> `/app/storage`
- `./logs` -> `/app/logs`

### Production notes

- Use a real `APP_BASE_URL` so shared proposal links work outside localhost.
- Use real provider secrets in production and rotate them normally.
- Run API and worker as separate processes or deployments.
- Scale the worker independently of the API.
- Keep MongoDB and Redis managed outside the app container for serious environments.

## Troubleshooting

### `docker compose` cannot connect to the daemon

Docker Desktop is not running. Start it first and confirm with:

```bash
docker info
```

### Server exits with environment validation errors

Your `.env` is missing required values or contains an invalid value. The most common offenders are:

- `JWT_SECRET`
- `MONGODB_URI`
- `OPENAI_API_KEY`
- `WHATSAPP_*`
- `RAZORPAY_*`

### API starts but nothing happens after inbound traffic

You are probably in BullMQ mode without a worker process. Start it with:

```bash
npm run start:worker
```

If you want the app to run everything in one process, set:

```bash
DISABLE_QUEUE_BACKEND=true
```

and restart only the API.

### Readiness says degraded because Redis is down

That is expected in BullMQ mode.

You have two choices:

1. Start Redis and the worker normally.
2. Set `DISABLE_QUEUE_BACKEND=true` if you want standalone single-process operation.

### WhatsApp still does not reach your phone

This usually means one of these is still missing:

- real Meta credentials
- a public webhook URL
- correct verify token in Meta
- your phone approved in Meta when using a test sender number

### `npm run seed:test-whatsapp` fails

MongoDB is not running or your `MONGODB_URI` is wrong.

### Proposal link returns `404`

The token is wrong or the proposal id and token pair do not match.

### Proposal link returns `410`

The proposal was superseded by a newer version.

### Outbound email never arrives

If `SMTP_HOST` is blank, the email transporter is intentionally a no-op.

### Payment flow does not finish after order creation

Creating the order only creates backend state plus a Razorpay order id. You still need:

- a real client-side checkout flow, or
- a simulated `payment.captured` webhook for testing

## Additional documentation

- `docs/system-design.md`
- `docs/saas-platform.md`
