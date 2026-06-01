# API INTEGRATION AGREEMENT
## TAG-N-RIDE (PTY) LTD

**Doc Ref:** TNR-BA-API-[YYYY]-[NNN]
**Effective Date:** [DATE]

---

## PARTIES

**API Provider:** [COMPANY NAME] ("**Provider**"), Reg. No. [REG NO]
**API Consumer:** Tag-n-Ride (Pty) Ltd ("**TNR**"), Reg. No. [CIPC REG NO]

*(Reverse if TNR is the API Provider)*

---

## 1. GRANT OF API ACCESS

1.1 Provider grants TNR a **limited, non-exclusive, non-transferable, revocable** right to access and use the Provider's Application Programming Interface ("**API**") as specified in the API Documentation (Annexure A), solely for the purpose of [integrating payment processing / identity verification / SMS delivery / etc.] within TNR's platform.

1.2 TNR shall not:
- Sublicence, resell, or commercialise API access to third parties
- Use the API for any purpose not described in this Agreement
- Reverse engineer, decompile, or extract source code via API responses
- Access the API beyond the agreed rate limits

---

## 2. API SPECIFICATIONS AND ENVIRONMENT

| Environment | Base URL | API Key | Rate Limit |
|------------|----------|---------|-----------|
| Sandbox | [URL] | [KEY] | [X] req/min |
| Production | [URL] | [KEY] | [X] req/min |

**Versioning:** Provider will maintain the current API version for a minimum of **12 months** after notifying TNR of a new version. TNR will have **90 days** to migrate to the new version.

**Deprecation notice:** Minimum **90 days** written notice before retiring any endpoint.

---

## 3. AUTHENTICATION AND SECURITY

- Authentication method: ☐ OAuth 2.0  ☐ API Key + Secret  ☐ JWT  ☐ mTLS
- TNR must store API credentials in a secure vault (not in source code or logs)
- TNR must rotate API keys every **90 days** or immediately upon suspected compromise
- All API calls must be made over **HTTPS/TLS 1.2+** only
- TNR must implement IP allowlisting for production API calls where supported

---

## 4. DATA HANDLING

4.1 **Data minimisation:** TNR will only send personal data to the API that is strictly necessary for the integration purpose.

4.2 **POPIA compliance:** Provider acts as an **operator** of personal data on behalf of TNR. This Agreement constitutes the Data Processing Agreement required under POPIA. Provider must:
- Process data only per TNR's instructions
- Implement appropriate security measures
- Notify TNR of any breach within **24 hours**
- Delete TNR data within **30 days** of contract termination

4.3 **Data residency:** [Specify where data is stored — e.g., "All personal data processed under this Agreement is stored within the Republic of South Africa" or "AWS Cape Town region only"]

4.4 **Logging:** Provider may log API calls for operational purposes. Logs containing personal data must be retained for no more than **90 days** unless required by law.

---

## 5. SERVICE LEVELS

| Metric | Commitment |
|--------|------------|
| API uptime | 99.9% monthly |
| Response time (p95) | ≤ 500ms |
| Incident notification (P1) | Within 15 minutes |
| Scheduled maintenance notice | 48 hours minimum |

Service credits apply as per the SLA schedule (Annexure B).

---

## 6. TESTING AND ACCEPTANCE

6.1 Integration testing must be completed in the **sandbox environment** before production access is granted.

6.2 TNR must complete a **security review checklist** (Annexure C) before go-live.

6.3 TNR must not load-test or stress-test the production environment without **prior written approval** from Provider.

---

## 7. USAGE MONITORING AND COMPLIANCE

- Provider may monitor API usage for abuse, rate limit violations, and anomalous patterns
- Provider may suspend TNR's API access (with notice) if:
  - TNR exceeds rate limits after warning
  - Usage patterns suggest security breach or misuse
  - TNR is in breach of this Agreement
- Emergency suspension (without notice) permitted only if Provider detects active security incident

---

## 8. FEES

| Tier | Volume | Rate |
|------|--------|------|
| [Tier 1] | 0 – [X] API calls/month | R[AMOUNT] / call |
| [Tier 2] | [X+1] – [Y] calls/month | R[AMOUNT] / call |
| [Tier 3] | > [Y] calls/month | R[AMOUNT] / call |

Invoiced monthly in arrears. Payable **30 days** from invoice date.

---

## 9. INTELLECTUAL PROPERTY

- Provider's API, documentation, underlying platform, and all IP remain Provider's sole property
- TNR's integration code, business logic, and derivative works remain TNR's property
- No transfer of IP occurs under this Agreement

---

## 10. TERM AND TERMINATION

- Initial term: **12 months**, auto-renewing annually
- Termination for convenience: **30 days** written notice
- Immediate termination: Material breach; insolvency; regulatory prohibition
- Upon termination: TNR must destroy or return all API credentials; Provider will disable access within **24 hours** of notice

---

## SIGNATURES

___________________________
**Mr Profy T D Keakile**
CEO — Tag-n-Ride (Pty) Ltd
Date: ____________________

___________________________
**[NAME]**
[Title] — [Provider]
Date: ____________________

---

*Annexure A: API Documentation Reference*
*Annexure B: SLA and Service Credits*
*Annexure C: Go-Live Security Checklist*
