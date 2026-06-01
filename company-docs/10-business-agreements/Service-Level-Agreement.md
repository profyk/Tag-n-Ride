# SERVICE LEVEL AGREEMENT (SLA)
## TAG-N-RIDE (PTY) LTD

**Doc Ref:** TNR-BA-SLA-[YYYY]-[NNN]
**Effective Date:** [DATE]
**Review Date:** [DATE — annually]

---

## PARTIES

**Service Provider:**
[PROVIDER NAME], Reg. No. [REG NO], hereinafter "**Provider**"

**Client:**
Tag-n-Ride (Pty) Ltd, Reg. No. [CIPC REG NO], hereinafter "**Tag-n-Ride**" / "**Client**"

*(Or: Tag-n-Ride as Provider to a client — reverse as applicable)*

---

## 1. PURPOSE

This Service Level Agreement sets out the minimum service standards, availability commitments, support obligations, and remedies that the Provider must deliver to Tag-n-Ride in respect of the following services:

| Service | Description |
|---------|-------------|
| [Service 1] | e.g., Payment gateway processing |
| [Service 2] | e.g., Cloud infrastructure / hosting |
| [Service 3] | e.g., SMS / OTP delivery |
| [Service 4] | e.g., KYC verification API |

---

## 2. SERVICE AVAILABILITY (UPTIME)

| Service Tier | Availability Target | Maximum Monthly Downtime |
|-------------|--------------------|-----------------------|
| Critical (payment processing) | **99.9%** | ~44 minutes/month |
| High (platform core) | **99.5%** | ~3.6 hours/month |
| Standard (reporting / admin) | **99.0%** | ~7.3 hours/month |

**Downtime Definition:** Any period during which the service is unavailable or performs below agreed performance benchmarks, **excluding** scheduled maintenance windows.

**Scheduled Maintenance:** Must be communicated at least **48 hours** in advance via email to ops@tagnride.co.za. Permitted window: Sundays 02:00–06:00 SAST.

---

## 3. PERFORMANCE METRICS

| Metric | Target |
|--------|--------|
| Transaction processing time (p95) | ≤ 3 seconds |
| API response time (p99) | ≤ 500ms |
| OTP delivery time | ≤ 30 seconds |
| Payment settlement T+ | T+1 business day |
| Fraud detection alert time | ≤ 60 seconds |
| Error rate (failed transactions) | ≤ 0.5% |

---

## 4. SUPPORT AND INCIDENT MANAGEMENT

### Incident Severity Levels

| Priority | Description | Response Time | Resolution Target |
|----------|-------------|---------------|------------------|
| **P1 — Critical** | Complete service outage, payment processing down | **15 minutes** | 4 hours |
| **P2 — High** | Major functionality impaired, >25% of transactions affected | **1 hour** | 8 hours |
| **P3 — Medium** | Non-critical feature unavailable, <25% impact | **4 business hours** | 2 business days |
| **P4 — Low** | Minor issues, cosmetic errors, enhancement requests | **1 business day** | 5 business days |

### Support Channels

| Channel | Hours | Purpose |
|---------|-------|---------|
| Emergency hotline | 24/7 | P1 incidents only |
| Email: [SUPPORT EMAIL] | Business hours | P2–P4 |
| Support portal | 24/7 | Ticket logging |
| Dedicated account manager | Business hours | Escalations |

### Escalation Matrix

| Level | Contact | Triggered When |
|-------|---------|----------------|
| L1 | Support Engineer | Ticket opened |
| L2 | Senior Engineer | P1/P2 unresolved after 1 hour |
| L3 | Engineering Manager | P1 unresolved after 2 hours |
| Executive | [Account Director name] | P1 unresolved after 3 hours |

---

## 5. SERVICE CREDITS (PENALTIES)

If monthly availability falls below the agreed target, Tag-n-Ride is entitled to service credits:

| Monthly Availability | Credit |
|---------------------|--------|
| 99.0% – 99.9% (missing target) | 5% of monthly fee |
| 98.0% – 98.99% | 10% of monthly fee |
| 95.0% – 97.99% | 25% of monthly fee |
| Below 95.0% | 50% of monthly fee |
| 3 consecutive P1 incidents in a month | Option to terminate without penalty |

**Cap on service credits:** 50% of monthly fees in any single month.

---

## 6. DATA AND SECURITY

- Provider must maintain **ISO 27001** or equivalent data security certification (or provide evidence of controls)
- Data processed under this SLA is governed by Tag-n-Ride's **Data Processing Agreement (POPIA)**
- Provider must notify Tag-n-Ride of any data breach within **24 hours** of discovery
- Provider shall not sub-process data to third parties without prior written consent

---

## 7. BUSINESS CONTINUITY AND DISASTER RECOVERY

| Metric | Requirement |
|--------|-------------|
| Recovery Time Objective (RTO) | ≤ 4 hours (P1) |
| Recovery Point Objective (RPO) | ≤ 1 hour |
| Data backup frequency | Daily (minimum) |
| Backup retention | 30 days |
| DR test frequency | Bi-annually |

---

## 8. REPORTING

Provider shall deliver the following reports to Tag-n-Ride:

| Report | Frequency | Delivery |
|--------|-----------|---------|
| Uptime / availability report | Monthly | By 5th of following month |
| Incident log | Monthly | By 5th of following month |
| Performance metrics dashboard | Real-time | Via portal |
| Security / vulnerability report | Quarterly | Via email |

---

## 9. TERM AND TERMINATION

- Initial term: **[12/24] months** from Effective Date
- Renewal: Auto-renews for 12-month periods unless terminated on **60 days' written notice**
- Immediate termination triggers: 3 consecutive SLA breaches; material data breach; insolvency

---

## SIGNATURES

___________________________
**Mr Profy T D Keakile**
CEO — Tag-n-Ride (Pty) Ltd
Date: ____________________

___________________________
**[Authorised Signatory]**
[Title] — [Provider]
Date: ____________________
