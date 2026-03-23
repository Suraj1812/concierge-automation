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

1. Copy `.env.example` to `.env` and fill in real credentials.
2. Start infrastructure with `docker-compose up mongo redis`.
3. Install dependencies with `npm install`.
4. Run the API with `npm run dev`.
5. Run workers with `npm run dev:worker`.

## Verification

- Type check: `npm run lint`
- Production build: `npm run build`
- End-to-end smoke flow: `npm run test:smoke`
- Hardening flow: `npm run test:hardening`

## Docs

- Full system design: [docs/system-design.md](/Users/surajsingh/Documents/New%20project/docs/system-design.md)
