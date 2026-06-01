# INCIDENT RESPONSE POLICY
## TAG-N-RIDE (PTY) LTD

**Version:** 1.0
**Effective Date:** [DATE]
**Owner:** CTO — Mr Profy T D Keakile

---

## 1. PURPOSE

This policy establishes Tag-n-Ride's procedures for detecting, containing, and recovering from security incidents, data breaches, and payment system failures — protecting our users, our business, and our legal obligations under POPIA.

---

## 2. SCOPE

Applies to all employees, contractors, and systems involved in:
- The Tag-n-Ride mobile application and backend API;
- Payment processing systems (Stitch integration);
- User wallet and financial data;
- Admin dashboard and internal tools;
- Any third-party systems holding Tag-n-Ride or user data.

---

## 3. INCIDENT CATEGORIES

| Severity | Description | Example |
|----------|-------------|---------|
| **P1 — Critical** | Active breach, financial loss, all users affected | API compromised, wallet funds stolen |
| **P2 — High** | Significant risk, potential data exposure | Unauthorised access to user records |
| **P3 — Medium** | Limited impact, no confirmed data loss | Single account suspicious activity |
| **P4 — Low** | Minor, no user impact | Failed brute-force attempt, logged and blocked |

---

## 4. INCIDENT RESPONSE TEAM

| Role | Person | Contact |
|------|--------|---------|
| Incident Commander | CTO / CEO (Mr Profy T D Keakile) | [EMAIL / PHONE] |
| Engineering Lead | [DEVELOPER NAME] | [CONTACT] |
| Communications Lead | CEO | [EMAIL] |
| Legal / Compliance | [LAWYER / COMPLIANCE OFFICER] | [CONTACT] |
| Payment Partner | Stitch Support | [STITCH SUPPORT CONTACT] |

---

## 5. RESPONSE PROCEDURE

### Phase 1 — Detection and Reporting (0–1 hour)

5.1.1 Any employee who discovers or suspects an incident must **immediately** notify the CTO via phone or direct message — do not use email for initial urgent alerts.

5.1.2 Do not attempt to investigate or remediate without authorisation — you may destroy evidence or worsen the situation.

5.1.3 The CTO shall declare the incident level (P1–P4) within **30 minutes** of notification.

5.1.4 For P1/P2 incidents, the full Incident Response Team must be assembled within **1 hour**.

---

### Phase 2 — Containment (1–4 hours for P1)

5.2.1 Immediately isolate affected systems from the network where possible.

5.2.2 Suspend suspected compromised accounts or credentials.

5.2.3 Notify Stitch of any suspected payment system compromise.

5.2.4 Preserve all system logs and evidence before making changes.

5.2.5 Do not delete or modify anything until the Incident Commander approves.

---

### Phase 3 — Investigation (Ongoing)

5.3.1 Determine the **scope** of the incident: what data was accessed, how many users affected, how the breach occurred.

5.3.2 Engage forensic/security expertise if needed.

5.3.3 Document all findings in the **Incident Log**.

---

### Phase 4 — Notification

#### Internal Notification

5.4.1 Keep all relevant team members informed at regular intervals (at least every 2 hours for P1).

5.4.2 Brief the CEO for all P1 and P2 incidents immediately.

#### Regulatory Notification (POPIA)

5.4.3 If personal information of users has been compromised, Tag-n-Ride must:
  (a) Notify the **Information Regulator** within **72 hours** of becoming aware of the breach;
  (b) Notify **affected users** as soon as reasonably possible thereafter.

5.4.4 The notification must include:
  (a) Nature and extent of the breach;
  (b) Categories and number of affected data subjects;
  (c) Likely consequences of the breach;
  (d) Measures taken to address the breach;
  (e) Contact details for further enquiries.

**Information Regulator:** complaints.IR@justice.gov.za

#### Financial Regulator Notification

5.4.5 If the incident involves suspected money laundering, fraud, or financial crime, notify the FIC and relevant authorities as required by FICA.

#### User Communication

5.4.6 Users must be notified:
  (a) When their personal data or wallet has been compromised;
  (b) In plain, clear language — no jargon;
  (c) With guidance on steps they should take (e.g., change password, watch for fraud);
  (d) Via in-app notification and/or SMS/email.

5.4.7 **Never** publicly minimise or deny a breach before facts are confirmed.

---

### Phase 5 — Recovery

5.5.1 Restore systems from clean backups only.

5.5.2 Verify system integrity before bringing services back online.

5.5.3 Apply patches, reset compromised credentials, and harden affected systems.

5.5.4 Conduct a **security review** before re-enabling affected features.

---

### Phase 6 — Post-Incident Review

5.6.1 Within **5 (five) business days** of resolution, the Incident Response Team shall conduct a post-incident review ("PIR"):
  (a) Root cause analysis — what happened and how?
  (b) Response effectiveness — what worked, what didn't?
  (c) Remediation completeness — are all vulnerabilities addressed?
  (d) Preventive measures — what changes will prevent recurrence?

5.6.2 A written PIR report shall be completed and shared with the Board.

5.6.3 All action items from the PIR shall be assigned owners and tracked to completion.

---

## 6. INCIDENT LOG

All incidents must be documented in the Incident Log, including:
  (a) Date/time of discovery;
  (b) Discovery method;
  (c) Systems and data affected;
  (d) Response actions and timeline;
  (e) Notifications made;
  (f) Resolution and preventive actions.

---

## 7. TESTING

7.1 Incident response procedures shall be tested via **tabletop exercises** at least **annually**.

7.2 Penetration tests of the payment and API infrastructure shall be conducted at least **annually** or after major releases.

---

*Approved by:*

___________________________
**Mr Profy T D Keakile**
CTO & CEO — Tag-n-Ride (Pty) Ltd
Date: ____________________
