# Combat Package Playbook (Single Source of Truth)

## Purpose
This document is the single production guide for security hardening, anti-spam, privacy/cookies, and SEO operations for this landing.

## Current State in This Repository
Implemented in code:
- Contact recipient is set to `info@inmolarisa.com`.
- Client anti-spam protections are enabled:
  - honeypot field
  - minimum form fill time
  - short cooldown between submits
- Cookie consent supports three modes:
  - Accept all
  - Essential only
  - Reject optional
- Technical SEO is improved:
  - multilingual alternates in metadata and sitemap
  - expanded structured data
- Baseline security directives exist in HTML metadata:
  - CSP baseline
  - referrer policy
  - permissions policy
- Cloudflare Turnstile is integrated on the client side (widget + token check).

## Important Architecture Note
The form currently submits to `formsubmit.co`.

Because of that:
- Cloudflare rate limits and WAF rules on your domain cannot fully protect the external `formsubmit.co` endpoint.
- For strict anti-spam control, move to your own endpoint on your domain (Worker/API) and verify Turnstile server-side.

## Production Hardening Plan

### 1) Cloudflare DNS and TLS
1. Add the domain to Cloudflare and switch nameservers.
2. Set SSL/TLS mode to Full (strict).
3. Enable Always Use HTTPS.
4. Enable Automatic HTTPS Rewrites.
5. Set minimum TLS version to 1.2 or higher.
6. Enable HSTS after HTTPS is stable:
   - `max-age=31536000; includeSubDomains`
   - Add `preload` only when fully ready.

### 2) Edge Security Headers
Set at Cloudflare edge (Transform Rules or Worker):
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()`
- `Content-Security-Policy` aligned to real resource domains.

### 3) WAF and Bot Protection
1. Enable Cloudflare Managed Ruleset.
2. Keep OWASP protections enabled.
3. Bot Fight Mode: ON (or Super Bot Fight Mode on paid plans).
4. Verified bots: allow.
5. Definitely automated: block or managed challenge.

### 4) Rate Limiting Rules
Add rate limits for your own domain endpoints:
1. POST flood rule:
   - expression: request method POST
   - threshold: 10-20 requests per minute per IP
   - action: Managed Challenge or Block for 10 minutes
2. Scanner rule:
   - match paths like `/wp-`, `/xmlrpc`, `/.env`, `/admin`
   - threshold: 5 requests per minute
   - action: Block for 1 hour

## Turnstile: Correct Production Setup

### Current status
- Client widget and token transport are present in the landing.
- Placeholder site key must be replaced with a real key.

### Required steps
1. Create Turnstile widget in Cloudflare dashboard.
2. Put real site key in the form widget.
3. Verify Turnstile token server-side using secret key.
4. Reject requests when validation fails.

### Recommended implementation
Use `worker-turnstile-contact-example.js` as the base for a Worker endpoint.
- It validates `turnstileToken` with Cloudflare siteverify API.
- It rejects bots/honeypot hits and missing mandatory fields.
- Replace the forwarding TODO with your email provider or internal API.

## Privacy and Cookie Compliance
Done:
- Privacy page expanded to include stronger legal structure.
- Cookie consent supports three modes and persisted state.

Still required before legal sign-off:
1. Legal review for Spain/EU requirements.
2. Confirm legal entity details (NIF/CIF, legal address, contact channel).
3. Confirm data retention periods and processor list accuracy.

## SEO Operations Checklist
Already in code:
- hreflang metadata
- multilingual sitemap alternates
- enriched schema

Operational actions:
1. Verify property in Google Search Console.
2. Verify property in Bing Webmaster Tools.
3. Submit sitemap in both.
4. Monitor index coverage weekly.
5. Confirm language URLs are indexed and not blocked.

## Monitoring and Incident Readiness
1. Enable Cloudflare Security Events monitoring.
2. Configure alerts for:
   - traffic spikes
   - WAF block/challenge spikes
   - abnormal 4xx/5xx changes
3. Keep weekly backup snapshots of:
   - site files
   - DNS records
   - Cloudflare rule settings

## Deployment Procedure
1. Deploy latest code.
2. Purge Cloudflare cache.
3. Validate these paths and flows:
   - language switcher
   - cookie banner actions
   - contact form success path
   - anti-spam rejection paths
4. Validate response headers from public internet.
5. Re-check crawlability and sitemap availability.

## Quick Verification Matrix
- Functional:
  - form submit works for real user
  - blocked for honeypot/spam patterns
- Security:
  - WAF rules firing
  - rate limit triggers under burst tests
  - Turnstile challenge appears and validates
- SEO:
  - sitemap reachable
  - hreflang present
  - canonical and metadata correct

## Priority Backlog (If You Want Maximum Protection)
1. Move form processing from `formsubmit.co` to your own endpoint under your domain.
2. Enforce Turnstile server-side verification for every submission.
3. Move CSP and other security headers fully to edge/server.
4. Add automated uptime and synthetic form-flow checks.
