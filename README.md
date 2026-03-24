# AI Concierge System

Production-grade, SaaS-ready AI concierge backend for luxury concierge operations across WhatsApp, AI orchestration, vendor sourcing, proposals, payments, and bookings.

## What’s Included

- WhatsApp Cloud API webhook ingestion and outbound messaging
- OpenAI-powered conversation engine with structured extraction
- MongoDB persistence for customers, enquiries, conversations, vendors, quotes, proposals, payments, bookings, notifications, and audit logs
- BullMQ + Redis background processing for conversation handling, vendor outreach, retries, reminders, proposal generation, and booking lifecycle jobs
- Razorpay payment order creation and verified webhook processing
- PDF proposal generation and signed proposal delivery
- JWT-protected admin APIs, idempotent write endpoints, validation, centralized error handling, logging, and auditability
- Liveness/readiness/metrics endpoints, dead-letter queue capture, and correlation-aware structured logs

## Quick Start

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Start Docker Desktop or another Docker daemon, or use local MongoDB and Redis instead.
4. Start infrastructure with `docker compose up -d mongo redis`.
5. Run the API with `npm run dev`.
6. Run workers with `npm run dev:worker`.

The example env is bootable for local development. Replace `JWT_SECRET` and `OPENAI_API_KEY` with real values before production.

## Verification

- Type check: `npm run lint`
- Production build: `npm run build`
- End-to-end smoke flow: `npm run test:smoke`
- Hardening flow: `npm run test:hardening`

## Docs

- Full system design: `docs/system-design.md`
- SaaS platform design: `docs/saas-platform.md`
