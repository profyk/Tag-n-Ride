"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import { Spinner } from "@/components/ui";
import { isSuperAdmin, getToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  FileText, FolderOpen, Folder, Plus, Save, Download, Printer, Share2,
  Copy, CheckCheck, Search, X, Bold, Italic, List, ListOrdered,
  Quote, Code, Columns, Minus, Table as TableIcon,
  Eye, EyeOff, Maximize2, Minimize2, ChevronRight, ChevronDown,
  Pencil, Trash2, Database, Lock, Crown, AlertTriangle, RotateCcw,
  FileSignature, Layers, BookOpen, Clock, Hash, Type,
  FilePlus, FolderPlus, Heading1, Heading2, Heading3,
  AlignLeft, Strikethrough, Link, Upload, PenLine,
  CheckCircle, Info, Sparkles, History, Settings2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccessLevel = "public" | "internal" | "confidential" | "restricted";

interface DocFile {
  dbId?: string;
  name: string;
  path: string;
  category: string;
  folder: string;
  fileName?: string;
  size?: number;
  accessLevel: AccessLevel;
  version?: number;
  updatedAt?: string;
}

interface DocFolder {
  id: string;
  label: string;
  color: string;
  files: DocFile[];
}

type ViewMode = "edit" | "preview" | "split";

// ── Constants ─────────────────────────────────────────────────────────────────

const FOLDER_COLORS: Record<string, string> = {
  purple: "text-purple", yellow: "text-yellow", cyan: "text-cyan",
  green: "text-green", orange: "text-orange-400", red: "text-red",
  pink: "text-pink-400", blue: "text-blue-400",
};

const ACCESS_CONFIG: Record<AccessLevel, { label: string; color: string }> = {
  public:       { label: "Public",       color: "text-green  bg-green/10  border-green/20" },
  internal:     { label: "Internal",     color: "text-cyan   bg-cyan/10   border-cyan/20" },
  confidential: { label: "Confidential", color: "text-yellow bg-yellow/10 border-yellow/20" },
  restricted:   { label: "Restricted",   color: "text-red    bg-red/10    border-red/20" },
};

// ── Document templates ────────────────────────────────────────────────────────

const TEMPLATES: { id: string; name: string; category: string; icon: string; content: string }[] = [
  {
    id: "employment-contract",
    name: "Employment Contract",
    category: "HR",
    icon: "📄",
    content: `# EMPLOYMENT CONTRACT

**Tag-n-Ride (Pty) Ltd**
Registration No: [REG NUMBER]
("the Company")

And

**[EMPLOYEE FULL NAME]**
ID No: [ID NUMBER]
("the Employee")

---

## 1. COMMENCEMENT DATE

The Employee's employment commenced on **[START DATE]**.

## 2. POSITION

The Employee is appointed as **[JOB TITLE]** in the **[DEPARTMENT]** department, reporting to **[LINE MANAGER]**.

## 3. REMUNERATION

The Employee will be remunerated at a gross monthly salary of **R [AMOUNT]**, subject to applicable statutory deductions including PAYE and UIF.

## 4. WORKING HOURS

Standard working hours are Monday to Friday, 08:00 to 17:00, subject to the operational requirements of the Company.

## 5. LEAVE ENTITLEMENT

| Leave Type          | Days Per Annum |
|---------------------|---------------|
| Annual Leave        | 21            |
| Sick Leave          | 30 (3-year cycle) |
| Family Responsibility | 3           |

## 6. CONFIDENTIALITY

The Employee agrees to maintain strict confidentiality regarding all proprietary information, trade secrets, and client data encountered during employment.

## 7. TERMINATION

Either party may terminate this agreement by giving **[NOTICE PERIOD]** written notice.

---

**Signed at _____________ on _____________**

___________________________
For and on behalf of the Company

___________________________
Employee Signature
`,
  },
  {
    id: "nda",
    name: "Non-Disclosure Agreement",
    category: "Legal",
    icon: "🔒",
    content: `# NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into as of **[DATE]** between:

**Tag-n-Ride (Pty) Ltd** ("Disclosing Party")

And

**[RECIPIENT NAME / COMPANY]** ("Receiving Party")

---

## 1. CONFIDENTIAL INFORMATION

For purposes of this Agreement, "Confidential Information" means any data or information that is proprietary to the Disclosing Party and not generally known to the public, including but not limited to:

- Business strategies and plans
- Financial data and projections
- Customer and driver data
- Technology, source code, and algorithms
- Marketing plans and pricing

## 2. OBLIGATIONS

The Receiving Party agrees to:

1. Hold all Confidential Information in strict confidence
2. Not disclose Confidential Information to any third party without prior written consent
3. Use Confidential Information solely for the purpose of evaluating the business relationship
4. Protect Confidential Information with at least the same degree of care used for its own confidential information

## 3. TERM

This Agreement shall remain in effect for a period of **[DURATION]** from the date of signing.

## 4. GOVERNING LAW

This Agreement shall be governed by the laws of the Republic of South Africa.

---

**SIGNED BY THE PARTIES:**

___________________________
Tag-n-Ride (Pty) Ltd

___________________________
[Recipient Name]

Date: _______________
`,
  },
  {
    id: "offer-letter",
    name: "Offer of Employment",
    category: "HR",
    icon: "✉️",
    content: `# OFFER OF EMPLOYMENT

**Date:** [DATE]

**To:** [CANDIDATE FULL NAME]
**Position:** [JOB TITLE]
**Department:** [DEPARTMENT]

Dear [FIRST NAME],

We are pleased to offer you employment at **Tag-n-Ride (Pty) Ltd** on the following terms:

---

## TERMS OF OFFER

| Detail                | Information        |
|-----------------------|--------------------|
| Start Date            | [START DATE]       |
| Job Title             | [JOB TITLE]        |
| Department            | [DEPARTMENT]       |
| Reporting to          | [MANAGER NAME]     |
| Gross Monthly Salary  | R [AMOUNT]         |
| Employment Type       | [PERMANENT / FTC]  |
| Probation Period      | 3 months           |

## CONDITIONS OF EMPLOYMENT

This offer is conditional upon:

1. Successful completion of background and reference checks
2. Submission of certified copies of qualifications and ID
3. Signing of the Employment Contract and NDA
4. Satisfactory results of pre-employment screening

## ACCEPTANCE

Please confirm your acceptance of this offer by signing below and returning this letter by **[DEADLINE DATE]**.

We look forward to welcoming you to the Tag-n-Ride team.

Yours sincerely,

___________________________
HR Manager / CEO
Tag-n-Ride (Pty) Ltd

---

**I accept the above offer of employment:**

Name: ___________________________

Signature: ___________________________

Date: ___________________________
`,
  },
  {
    id: "termination-letter",
    name: "Termination Letter",
    category: "HR",
    icon: "⚠️",
    content: `# NOTICE OF TERMINATION OF EMPLOYMENT

**PRIVATE & CONFIDENTIAL**

Date: [DATE]

To: [EMPLOYEE FULL NAME]
Position: [JOB TITLE]

Dear [FIRST NAME],

---

## TERMINATION OF EMPLOYMENT

This letter serves as formal notice that your employment with **Tag-n-Ride (Pty) Ltd** is terminated with effect from **[TERMINATION DATE]**.

**Reason for Termination:** [REASON — e.g., retrenchment / misconduct / poor performance / end of fixed-term contract]

## NOTICE PERIOD

In terms of your employment contract, you are required to serve a notice period of **[NOTICE PERIOD]**, ending on **[LAST WORKING DAY]**.

## FINAL SETTLEMENT

Your final settlement will include:

- Salary up to and including your last working day
- Leave pay for any accrued unused leave
- Any other amounts owing per your contract

The Company will settle your UIF claim in accordance with applicable legislation.

## RETURN OF COMPANY PROPERTY

Please ensure all company property (devices, access cards, documentation) is returned by your last working day.

---

Signed by: ___________________________
HR Manager / Director

On behalf of: Tag-n-Ride (Pty) Ltd

Date: ___________________________
`,
  },
  {
    id: "board-resolution",
    name: "Board Resolution",
    category: "Corporate Governance",
    icon: "🏛️",
    content: `# BOARD RESOLUTION

## TAG-N-RIDE (PTY) LTD

**Registration Number:** [REG NO]

---

## RESOLUTION [NUMBER] OF [YEAR]

**Date:** [DATE]
**Venue:** [LOCATION]

The following Directors were present:

| Name                    | Designation    |
|-------------------------|----------------|
| [DIRECTOR 1]            | CEO            |
| [DIRECTOR 2]            | CTO            |
| [DIRECTOR 3]            | CFO            |

A quorum being present, the following resolutions were duly passed:

---

## RESOLUTION

**IT IS RESOLVED THAT:**

[State the resolution clearly here]

---

## AUTHORISATION

The Directors hereby authorise [NAME / POSITION] to:

1. [Action 1]
2. [Action 2]
3. [Action 3]

---

**ADOPTED by the Board of Directors of Tag-n-Ride (Pty) Ltd:**

___________________________
[DIRECTOR NAME]
CEO / Director

___________________________
[DIRECTOR NAME]
CFO / Director

Date: ___________________________
`,
  },
  {
    id: "driver-agreement",
    name: "Driver Services Agreement",
    category: "Operations",
    icon: "🚗",
    content: `# DRIVER SERVICES AGREEMENT

This agreement is entered into between **Tag-n-Ride (Pty) Ltd** ("the Platform") and the undersigned driver ("the Driver").

---

## 1. NATURE OF AGREEMENT

The Driver acknowledges that this agreement does not constitute an employment relationship. The Driver operates as an **independent contractor** providing transportation services through the Tag-n-Ride platform.

## 2. PLATFORM ACCESS

The Driver is granted access to the Tag-n-Ride driver application subject to:

- Maintaining a valid Professional Driving Permit (PrDP)
- Maintaining a roadworthy vehicle meeting platform standards
- Compliance with all applicable traffic laws and regulations
- Maintaining minimum rating standards

## 3. COMMISSION STRUCTURE

| Transaction Type    | Platform Commission |
|--------------------|---------------------|
| Cash Trips          | [X]%               |
| Tag/Tap Payments    | [X]%               |
| Wallet Payments     | [X]%               |

## 4. PAYMENTS

Payments are made to the Driver's registered wallet on a [DAILY / WEEKLY] basis, subject to minimum threshold requirements.

## 5. SAFETY REQUIREMENTS

The Driver must comply with all SafeRide protocol requirements including:
- Dead Man check-ins every 30 minutes
- Panic button accessibility
- Passenger manifest completion

## 6. TERMINATION

The Platform may suspend or terminate access immediately for:
- Safety violations
- Fraudulent activity
- Repeated low ratings
- Criminal charges

---

Driver Signature: ___________________________

ID Number: ___________________________

Date: ___________________________

Vehicle Reg: ___________________________
`,
  },
  {
    id: "meeting-minutes",
    name: "Meeting Minutes",
    category: "Corporate Governance",
    icon: "📋",
    content: `# MEETING MINUTES

**Organisation:** Tag-n-Ride (Pty) Ltd
**Meeting Type:** [Board Meeting / Management Meeting / Ops Meeting]
**Date:** [DATE]
**Time:** [START TIME] – [END TIME]
**Venue:** [LOCATION / VIRTUAL]
**Chairperson:** [NAME]
**Minute Taker:** [NAME]

---

## ATTENDEES

| Name                | Role / Department   | Present |
|---------------------|---------------------|---------|
| [NAME]              | CEO                 | ✓       |
| [NAME]              | CFO                 | ✓       |
| [NAME]              | CTO                 | ✓       |

**Apologies:** [NAMES IF ANY]

---

## AGENDA

1. Opening and quorum
2. Approval of previous minutes
3. [AGENDA ITEM 3]
4. [AGENDA ITEM 4]
5. Any other business
6. Next meeting date

---

## MINUTES

### 1. Opening

The Chairperson called the meeting to order at [TIME] and confirmed that a quorum was present.

### 2. Approval of Previous Minutes

The minutes of the meeting held on [PREVIOUS DATE] were reviewed and approved without amendment.

### 3. [AGENDA ITEM]

**Discussion:** [Summary of discussion]

**Decision:** [Decision reached]

**Action:** [WHO] to [DO WHAT] by [DATE]

---

## ACTION ITEMS SUMMARY

| Action                  | Responsible | Due Date    | Status    |
|-------------------------|-------------|-------------|-----------|
| [ACTION 1]              | [NAME]      | [DATE]      | Pending   |

---

**Meeting closed at:** [TIME]

**Next Meeting:** [DATE AND TIME]

Confirmed by: ___________________________
Date: ___________________________
`,
  },
  {
    id: "company-policy",
    name: "Company Policy",
    category: "Policies",
    icon: "📜",
    content: `# [POLICY TITLE]

**Tag-n-Ride (Pty) Ltd**
**Policy Reference:** TNR-POL-[NUMBER]
**Version:** 1.0
**Effective Date:** [DATE]
**Review Date:** [DATE]
**Owner:** [DEPARTMENT / ROLE]

---

## 1. PURPOSE

This policy establishes [describe purpose and objectives].

## 2. SCOPE

This policy applies to all employees, contractors, and service providers of Tag-n-Ride (Pty) Ltd.

## 3. POLICY STATEMENT

[State the policy clearly and concisely]

## 4. PROCEDURES

### 4.1 [Procedure Name]

[Step-by-step procedure]

### 4.2 [Procedure Name]

[Step-by-step procedure]

## 5. ROLES AND RESPONSIBILITIES

| Role                   | Responsibility                          |
|------------------------|-----------------------------------------|
| [ROLE]                 | [What they are responsible for]         |
| [ROLE]                 | [What they are responsible for]         |

## 6. NON-COMPLIANCE

Failure to comply with this policy may result in disciplinary action up to and including termination of employment or contract.

## 7. REVIEW

This policy will be reviewed annually or as circumstances require.

---

**Approved by:** ___________________________
**Title:** ___________________________
**Date:** ___________________________
`,
  },
  {
    id: "warning-letter",
    name: "Written Warning",
    category: "HR",
    icon: "⚡",
    content: `# WRITTEN WARNING

**CONFIDENTIAL**

Date: [DATE]

Employee Name: [FULL NAME]
Employee ID: [ID / STAFF NUMBER]
Position: [JOB TITLE]
Department: [DEPARTMENT]

Dear [FIRST NAME],

---

## NATURE OF WARNING

This letter constitutes a **[FIRST / SECOND / FINAL] WRITTEN WARNING** regarding your conduct / performance as described below.

## INCIDENT DESCRIPTION

**Date of Incident:** [DATE]

**Description:**
[Describe the misconduct or performance issue in detail, including what was observed, when, where, and by whom]

## PREVIOUS DISCIPLINARY HISTORY

[State any prior warnings or disciplinary actions, or "None on record"]

## EXPECTED IMPROVEMENT

You are required to:

1. [Specific corrective action / behaviour change]
2. [Specific corrective action / behaviour change]
3. [Specific corrective action / behaviour change]

This improvement must be sustained with immediate effect.

## CONSEQUENCES

Should the behaviour continue or performance not improve to the required standard within **[TIMEFRAME]**, further disciplinary action will be taken which may include **dismissal**.

## EMPLOYEE ACKNOWLEDGEMENT

Your signature below acknowledges receipt of this warning. It does not necessarily indicate agreement.

---

Issued by: ___________________________

Title: ___________________________

Date: ___________________________

---

Employee Signature: ___________________________

Date: ___________________________

☐ Employee declined to sign — witnessed by: ___________________________
`,
  },
  {
    id: "popia-policy",
    name: "POPIA Privacy Policy",
    category: "Legal",
    icon: "🛡️",
    content: `# PRIVACY POLICY

**Tag-n-Ride (Pty) Ltd**
Last Updated: [DATE]

---

## 1. INTRODUCTION

Tag-n-Ride (Pty) Ltd ("we", "our", "us") is committed to protecting your personal information in accordance with the Protection of Personal Information Act 4 of 2013 (POPIA) and applicable data protection laws.

## 2. INFORMATION WE COLLECT

We collect the following categories of personal information:

| Category              | Examples                              |
|-----------------------|---------------------------------------|
| Identity Information  | Full name, ID number, photograph      |
| Contact Details       | Phone number, email address           |
| Financial Information | Bank account details, transaction history |
| Location Data         | GPS coordinates during trips          |
| Device Information    | Device type, app version              |

## 3. PURPOSE OF PROCESSING

We process your personal information for the following purposes:

- Providing and improving our transportation platform
- Processing payments and maintaining transaction records
- Verifying identity and conducting KYC/FICA compliance
- Ensuring safety through SafeRide features
- Communication regarding your account and services
- Compliance with legal obligations

## 4. LAWFUL BASIS FOR PROCESSING

We process personal information based on:
- Contract performance (providing our services)
- Legal obligation (FICA, tax compliance)
- Legitimate interest (fraud prevention, safety)
- Consent (where explicitly obtained)

## 5. DATA SHARING

We do not sell personal information. We share data only with:
- Payment gateway providers (for transactions)
- Regulatory authorities (as legally required)
- Service providers bound by data processing agreements

## 6. DATA RETENTION

| Data Category         | Retention Period            |
|-----------------------|-----------------------------|
| Account Data          | Duration of account + 5 years |
| Transaction Records   | 7 years (tax compliance)    |
| KYC Documents         | 5 years post-relationship   |

## 7. YOUR RIGHTS

Under POPIA, you have the right to:
- Access your personal information
- Request correction of inaccurate information
- Request deletion (subject to legal retention requirements)
- Object to processing
- Lodge a complaint with the Information Regulator

## 8. CONTACT

**Information Officer:** [NAME]
**Email:** privacy@tag-n-ride.co.za
**Postal Address:** [ADDRESS]

---

*This policy is effective as of the date stated above and supersedes all previous versions.*
`,
  },
  {
    id: "business-proposal",
    name: "Business Proposal",
    category: "Business Development",
    icon: "💼",
    content: `# BUSINESS PROPOSAL

**Presented by:** Tag-n-Ride (Pty) Ltd
**Presented to:** [CLIENT / PARTNER NAME]
**Date:** [DATE]
**Reference:** TNR-PROP-[NUMBER]

---

## EXECUTIVE SUMMARY

Tag-n-Ride is a South African fintech-enabled transportation platform connecting passengers, drivers, and fleet owners through a unified payment and safety ecosystem.

This proposal outlines our partnership offering for [CLIENT DESCRIPTION].

---

## THE OPPORTUNITY

[Describe the market opportunity or problem being solved]

## OUR SOLUTION

### Platform Overview

- **Passenger App**: Seamless tagging and payment experience
- **Driver App**: Route management, earnings tracking, SafeRide
- **Fleet Owner Portal**: Commission management, payroll, reporting
- **Admin Dashboard**: Full oversight and control

### Key Features

| Feature               | Benefit                              |
|-----------------------|--------------------------------------|
| Digital Payments      | Reduced cash handling risk           |
| SafeRide Protocol     | Enhanced passenger safety            |
| Real-time Analytics   | Data-driven operational decisions    |
| Automated Payroll     | Reduced admin burden                 |

## PROPOSED PARTNERSHIP

[Describe the specific terms of the proposed partnership or deal]

## COMMERCIAL TERMS

| Item                  | Detail                |
|-----------------------|-----------------------|
| Commission Rate       | [X]%                  |
| Payment Terms         | [NET 30 / Weekly]     |
| Contract Duration     | [PERIOD]              |
| Territory             | [REGION]              |

## NEXT STEPS

1. Review and approval of proposal
2. Legal review and contract signing
3. Technical integration / onboarding
4. Launch and monitoring

---

For further information, please contact:
[CONTACT NAME] | [EMAIL] | [PHONE]
`,
  },
  {
    id: "taxi-association-agreement",
    name: "Taxi Association Agreement",
    category: "Taxi Associations",
    icon: "🤝",
    content: `# TAXI ASSOCIATION PARTNERSHIP AGREEMENT

This agreement is entered into between:

**Tag-n-Ride (Pty) Ltd** ("the Platform")

And

**[ASSOCIATION NAME]** ("the Association")
Represented by: [CHAIRPERSON NAME]

---

## 1. PURPOSE

This agreement governs the partnership between the Platform and the Association for the deployment of Tag-n-Ride payment and safety technology across Association member vehicles.

## 2. ASSOCIATION OBLIGATIONS

The Association agrees to:

1. Encourage member drivers to register on the Tag-n-Ride platform
2. Facilitate digital payment adoption across member vehicles
3. Participate in SafeRide implementation
4. Attend platform training sessions
5. Report disputes and issues through official channels

## 3. PLATFORM OBLIGATIONS

Tag-n-Ride agrees to:

1. Provide dedicated onboarding support for Association members
2. Offer preferential commission rates as specified in Schedule A
3. Provide monthly analytics reports to Association leadership
4. Maintain a dedicated support line for Association members

## 4. COMMISSION STRUCTURE

| Route Type              | Standard Rate | Association Rate |
|------------------------|---------------|-----------------|
| Standard Routes         | [X]%          | [Y]%            |
| Long-Distance Routes    | [X]%          | [Y]%            |

## 5. DISPUTE RESOLUTION

Any disputes shall first be referred to the Joint Liaison Committee before formal legal proceedings.

## 6. TERM

This agreement is valid for **[PERIOD]** from the date of signing, with automatic renewal unless terminated with 60 days written notice.

---

**SIGNED AT [LOCATION] ON [DATE]:**

___________________________
For Tag-n-Ride (Pty) Ltd

___________________________
Chairperson, [Association Name]

___________________________
Secretary, [Association Name]
`,
  },
];

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  if (!md) return "";
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^#{6}\s(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#{5}\s(.+)$/gm, "<h5>$1</h5>")
    .replace(/^#{4}\s(.+)$/gm, "<h4>$1</h4>")
    .replace(/^#{3}\s(.+)$/gm, "<h3>$1</h3>")
    .replace(/^#{2}\s(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#{1}\s(.+)$/gm, "<h1>$1</h1>")
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.slice(1, -1).split("|").map(c => c.trim());
      const isDivider = cells.every(c => /^[-:]+$/.test(c));
      if (isDivider) return "<tr-divider>";
      return "<tr>" + cells.map(c => `<td>${c}</td>`).join("") + "</tr>";
    })
    .replace(/(<tr>[\s\S]*?<\/tr>)/gm, (match) => {
      const rows = match.split("\n").filter(r => r.startsWith("<tr>") && !r.startsWith("<tr-divider>"));
      if (rows.length === 0) return match;
      const header = rows[0].replace(/<td>/g, "<th>").replace(/<\/td>/g, "</th>");
      const body = rows.slice(1).join("\n");
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    })
    .replace(/<tr-divider>\n?/g, "")
    .replace(/^---+$/gm, "<hr>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/```[\w]*\n([\s\S]*?)```/g, "<pre><code>$1</code></pre>")
    .replace(/^&gt;\s(.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^[-*]\s(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s(.+)$/gm, "<oli>$1</oli>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, (m) => `<ul>${m}</ul>`)
    .replace(/(<oli>[\s\S]*?<\/oli>)/g, (m) => `<ol>${m.replace(/<\/?oli>/g, (t) => t === "<oli>" ? "<li>" : "</li>")}</ol>`)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");
  return `<div class="md-preview"><p>${html}</p></div>`;
}

// ── Toolbar button ─────────────────────────────────────────────────────────────

function ToolbarBtn({ icon: Icon, label, onClick, active }: { icon: any; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-1.5 rounded transition-all",
        active ? "bg-cyan/20 text-cyan" : "text-textMuted hover:text-text hover:bg-bg3"
      )}>
      <Icon size={13} />
    </button>
  );
}

// ── Access badge ──────────────────────────────────────────────────────────────

function AccessBadge({ level }: { level: AccessLevel }) {
  const cfg = ACCESS_CONFIG[level];
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold flex-shrink-0", cfg.color)}>
      <Lock size={8} />{cfg.label}
    </span>
  );
}

// ── Statistics bar ─────────────────────────────────────────────────────────────

function DocStats({ content }: { content: string }) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const chars = content.length;
  const readMins = Math.max(1, Math.ceil(words / 200));
  return (
    <div className="flex items-center gap-4 text-[10px] text-textDim">
      <span className="flex items-center gap-1"><Hash size={10} />{words} words</span>
      <span className="flex items-center gap-1"><Type size={10} />{chars} chars</span>
      <span className="flex items-center gap-1"><Clock size={10} />{readMins} min read</span>
    </div>
  );
}

// ── Signature canvas ──────────────────────────────────────────────────────────

function SignatureModal({ file, content, onClose }: { file: DocFile; content: string; onClose: () => void }) {
  const token = getToken();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signedDate, setSignedDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; e.preventDefault();
    setDrawing(true);
    const { x, y } = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return; e.preventDefault();
    const { x, y } = getPos(e, canvas);
    ctx.lineTo(x, y); ctx.stroke(); setHasStrokes(true);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); setHasStrokes(false);
  };

  const handleSave = async () => {
    if (!hasStrokes) { setError("Please draw your signature"); return; }
    if (!signerName.trim()) { setError("Signer name is required"); return; }
    setSaving(true); setError(null);
    const canvas = canvasRef.current;
    const sigDataUrl = canvas?.toDataURL("image/png") ?? "";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${file.name} — Signed</title>
<style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;color:#111;line-height:1.7;}pre{white-space:pre-wrap;}
.sig-block{margin-top:48px;border-top:1px solid #ccc;padding-top:20px;}.sig-block img{max-width:260px;height:80px;border:1px solid #ddd;}
</style></head><body><h1>${file.name}</h1><pre>${content}</pre>
<div class="sig-block"><p><strong>Electronic Signature</strong></p><img src="${sigDataUrl}" alt="sig"/>
<p>Signed by: <strong>${signerName}</strong></p><p>Date: <strong>${signedDate}</strong></p>
<p style="font-size:11px;color:#888;">Signed electronically via Tag-n-Ride Document Studio on ${new Date().toISOString()}</p>
</div><script>window.onload=()=>window.print()<\/script></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${file.name}-SIGNED.html`; a.click();
    URL.revokeObjectURL(url);
    setSaving(false);
    toast.success("Signed document downloaded — open in browser to print as PDF");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-bg2 border border-border rounded-2xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan/10 flex items-center justify-center"><FileSignature size={15} className="text-cyan" /></div>
            <div><p className="text-sm font-bold text-text">Electronic Signature</p><p className="text-[11px] text-textMuted truncate max-w-xs">{file.name}</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg3 text-textDim hover:text-text"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="flex items-center gap-2 px-3 py-2 bg-red/10 border border-red/20 rounded-lg"><AlertTriangle size={13} className="text-red" /><p className="text-xs text-red">{error}</p></div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Signer Name *</label>
              <input value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Full name" className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold uppercase tracking-wider text-textDim mb-1">Date Signed</label>
              <input type="date" value={signedDate} onChange={e => setSignedDate(e.target.value)} className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text focus:outline-none focus:border-cyan" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-textDim">Draw Your Signature *</label>
              <button onClick={clearCanvas} className="flex items-center gap-1 text-[10px] text-textDim hover:text-text"><RotateCcw size={10} />Clear</button>
            </div>
            <canvas ref={canvasRef} width={440} height={120} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={() => setDrawing(false)} onMouseLeave={() => setDrawing(false)} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={() => setDrawing(false)}
              className="w-full rounded-xl border-2 border-dashed border-cyan/30 bg-bg cursor-crosshair touch-none" style={{ height: "120px" }} />
            <p className="text-[10px] text-textDim mt-1">{hasStrokes ? "Signature drawn — clear to redo" : "Draw with mouse or touch"}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-textMuted hover:text-text">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-xs font-bold text-cyan disabled:opacity-50">
            {saving ? <><Spinner size={12} /><span>Saving...</span></> : <><FileSignature size={12} />Sign & Download</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template gallery ──────────────────────────────────────────────────────────

function TemplateGallery({ onSelect, onClose }: { onSelect: (t: typeof TEMPLATES[0]) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const cats = ["All", ...Array.from(new Set(TEMPLATES.map(t => t.category)))];
  const visible = TEMPLATES.filter(t =>
    (cat === "All" || t.category === cat) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-bg2 border border-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple/10 flex items-center justify-center"><Layers size={15} className="text-purple" /></div>
            <div><p className="text-sm font-bold text-text">Document Templates</p><p className="text-[11px] text-textMuted">{TEMPLATES.length} professional templates</p></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg3 text-textDim hover:text-text"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border flex-shrink-0 space-y-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." className="w-full bg-bg border border-border rounded-lg pl-7 py-1.5 text-xs text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {cats.map(c => (
              <button key={c} onClick={() => setCat(c)} className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all", cat === c ? "bg-cyan/10 border-cyan/30 text-cyan" : "border-border text-textMuted hover:border-cyan/30 hover:text-cyan")}>{c}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-3">
          {visible.map(t => (
            <button key={t.id} onClick={() => onSelect(t)} className="flex items-start gap-3 p-4 rounded-xl bg-bg border border-border hover:border-cyan/30 hover:bg-bg3 transition-all text-left group">
              <span className="text-2xl flex-shrink-0">{t.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-text group-hover:text-cyan transition-colors">{t.name}</p>
                <p className="text-[10px] text-textDim mt-0.5">{t.category}</p>
              </div>
            </button>
          ))}
          {visible.length === 0 && <div className="col-span-2 text-center py-8 text-textMuted text-sm">No templates match your search</div>}
        </div>
      </div>
    </div>
  );
}

// ── Folder section ─────────────────────────────────────────────────────────────

function FolderSection({ folder, selectedFile, onSelectFile, searchQuery, onEdit, onDelete }: {
  folder: DocFolder; selectedFile: DocFile | null;
  onSelectFile: (f: DocFile) => void; searchQuery: string;
  onEdit: (f: DocFile) => void; onDelete: (f: DocFile) => void;
}) {
  const colorClass = FOLDER_COLORS[folder.color] || "text-textMuted";
  const [open, setOpen] = useState(true);
  const visible = folder.files.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  if (visible.length === 0) return null;
  return (
    <div className="mb-1.5">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-bg3 transition-all">
        {open ? <FolderOpen size={12} className={colorClass} /> : <Folder size={12} className={colorClass} />}
        <span className={cn("flex-1 text-left text-[10px] font-extrabold uppercase tracking-wider", colorClass)}>{folder.label}</span>
        <span className="text-[10px] text-textDim mr-1">{visible.length}</span>
        {open ? <ChevronDown size={10} className="text-textDim" /> : <ChevronRight size={10} className="text-textDim" />}
      </button>
      {open && (
        <div className="ml-2 pl-2 border-l border-border/50 space-y-0.5 mt-0.5">
          {visible.map(file => {
            const active = selectedFile?.path === file.path;
            return (
              <div key={file.path} className={cn("group flex items-center gap-1 px-2 py-1.5 rounded-lg transition-all", active ? "bg-cyan/10 border border-cyan/20" : "hover:bg-bg3 border border-transparent")}>
                <button onClick={() => onSelectFile(file)} className="flex-1 flex items-center gap-2 text-left min-w-0">
                  <FileText size={11} className={active ? "text-cyan flex-shrink-0" : "text-textMuted flex-shrink-0"} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-semibold truncate", active ? "text-cyan" : "text-text")}>{file.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {file.dbId && <span className="text-[9px] text-purple font-bold flex items-center gap-0.5"><Database size={7} />DB</span>}
                      {file.version && file.version > 1 && <span className="text-[9px] text-textDim">v{file.version}</span>}
                    </div>
                  </div>
                  <AccessBadge level={file.accessLevel} />
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => onEdit(file)} title="Edit" className="p-1 rounded hover:bg-cyan/10 text-textDim hover:text-cyan"><Pencil size={10} /></button>
                  {file.dbId && <button onClick={() => onDelete(file)} title="Delete" className="p-1 rounded hover:bg-red/10 text-textDim hover:text-red"><Trash2 size={10} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ file, onConfirm, onCancel, deleting }: { file: DocFile; onConfirm: () => void; onCancel: () => void; deleting: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-bg2 border border-red/20 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-red/10 flex items-center justify-center"><Trash2 size={16} className="text-red" /></div>
          <div><p className="text-sm font-bold text-text">Delete document?</p><p className="text-xs text-textMuted">This action cannot be undone.</p></div>
        </div>
        <div className="px-3 py-2 bg-bg3 border border-border rounded-lg mb-4">
          <p className="text-xs font-semibold text-text">{file.name}</p>
          <p className="text-[10px] text-textDim font-mono mt-0.5">{file.path}</p>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-border text-xs font-medium text-textMuted hover:text-text">Cancel</button>
          <button onClick={onConfirm} disabled={deleting} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red/10 border border-red/30 hover:bg-red/20 text-xs font-bold text-red disabled:opacity-50">
            {deleting ? <><Spinner size={12} /><span>Deleting...</span></> : <><Trash2 size={12} />Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function slugToTitle(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {} as Record<string, string>;
}

function nameToFileName(name: string) {
  return name.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "") + ".md";
}

const FOLDER_META: Record<string, { label: string; color: string }> = {
  "01-legal-incorporation":     { label: "Legal & Incorporation",     color: "purple" },
  "02-equity-and-shares":       { label: "Equity & Shares",           color: "yellow" },
  "03-investor-documents":      { label: "Investor Documents",        color: "cyan"   },
  "04-hr-documents":            { label: "Human Resources",           color: "green"  },
  "05-company-policies":        { label: "Company Policies",          color: "orange" },
  "06-fintech-regulatory":      { label: "Fintech & Regulatory",      color: "red"    },
  "07-marketing":               { label: "Marketing",                 color: "pink"   },
  "08-daily-use":               { label: "Daily Use Templates",       color: "blue"   },
  "09-tax-sars":                { label: "Tax & SARS",                color: "yellow" },
  "10-business-agreements":     { label: "Business Agreements",       color: "orange" },
  "11-financial-management":    { label: "Financial Management",      color: "green"  },
  "12-corporate-governance":    { label: "Corporate Governance",      color: "purple" },
  "13-taxi-associations":       { label: "Taxi Associations",         color: "orange" },
  "14-tender-documents":        { label: "Tender Documents",          color: "red"    },
  "15-legal-documents":         { label: "Legal Documents",           color: "purple" },
  "16-appointments-promotions": { label: "Appointments & Promotions", color: "green"  },
};

export default function DocumentStudioPage() {
  const router = useRouter();
  const token = getToken();

  useEffect(() => {
    if (!isSuperAdmin()) router.replace("/admin/dashboard");
  }, [router]);

  const [allFolders, setAllFolders] = useState<DocFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [fullscreen, setFullscreen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSign, setShowSign] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DocFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // New/Edit doc state
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [docName, setDocName] = useState("");
  const [docFolder, setDocFolder] = useState("");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("internal");
  const [editingDbId, setEditingDbId] = useState<string | undefined>(undefined);

  const isDirty = content !== savedContent;

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/documents", { headers: authHeaders(token) });
      const d = await res.json();
      setAllFolders(d.folders || []);
    } catch { setAllFolders([]); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadDoc = useCallback(async (file: DocFile) => {
    setSelectedFile(file);
    setDocLoading(true);
    setDocError(null);
    setIsEditing(false);
    setIsNew(false);
    try {
      const params = new URLSearchParams({ path: file.path });
      if (file.dbId) params.set("dbId", file.dbId);
      const res = await fetch(`/api/documents/content?${params}`, { headers: authHeaders(token) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setContent(data.content || "");
      setSavedContent(data.content || "");
      setDocName(file.name);
      setDocFolder(file.folder);
      setAccessLevel(file.accessLevel);
      setEditingDbId(file.dbId);
    } catch (e: any) {
      setDocError(e.message);
      setContent("");
      setSavedContent("");
    } finally { setDocLoading(false); }
  }, [token]);

  const handleSave = async () => {
    if (!docName.trim()) { toast.error("Document name is required"); return; }
    if (!docFolder) { toast.error("Please select a folder"); return; }
    setSaving(true);
    const headers = { ...authHeaders(token), "Content-Type": "application/json" };
    try {
      if (isNew) {
        const fileName = nameToFileName(docName);
        const res = await fetch("/api/documents", {
          method: "POST", headers,
          body: JSON.stringify({ folder_id: docFolder, file_name: fileName, display_name: docName.trim(), content, access_level: accessLevel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || "Save failed");
        toast.success("Document created successfully");
        setIsNew(false);
        setEditingDbId(data.id);
        setSavedContent(content);
        loadList();
      } else if (editingDbId) {
        const res = await fetch(`/api/documents/${editingDbId}`, {
          method: "PUT", headers,
          body: JSON.stringify({ display_name: docName.trim(), content, access_level: accessLevel }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.detail || "Save failed");
        toast.success("Document saved");
        setSavedContent(content);
        loadList();
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.dbId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${deleteTarget.dbId}`, { method: "DELETE", headers: authHeaders(token) });
      if (!res.ok) throw new Error("Delete failed");
      if (selectedFile?.path === deleteTarget.path) { setSelectedFile(null); setContent(""); setSavedContent(""); }
      setDeleteTarget(null);
      loadList();
      toast.success("Document deleted");
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleting(false); }
  };

  const startNew = () => {
    setSelectedFile(null);
    setContent("");
    setSavedContent("");
    setDocName("");
    setDocFolder("");
    setAccessLevel("internal");
    setEditingDbId(undefined);
    setIsNew(true);
    setIsEditing(false);
    setViewMode("edit");
  };

  const openEdit = async (file: DocFile) => {
    await loadDoc(file);
    setIsEditing(true);
    setViewMode("split");
  };

  const useTemplate = (t: typeof TEMPLATES[0]) => {
    setContent(t.content);
    if (!docName) setDocName(t.name);
    setShowTemplates(false);
    toast.success(`Template loaded: ${t.name}`);
  };

  // ── Toolbar actions ──
  const insertText = (before: string, after = "", placeholder = "") => {
    const ta = editorRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || placeholder;
    const newContent = content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(newContent);
    setTimeout(() => {
      ta.focus();
      const newPos = start + before.length + selected.length + after.length;
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      e.preventDefault();
      insertText("**", "**", "bold text");
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "i") {
      e.preventDefault();
      insertText("*", "*", "italic text");
    }
    if (e.key === "Tab") {
      e.preventDefault();
      insertText("  ");
    }
  };

  const downloadDoc = () => {
    if (!content) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docName || "document"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printDoc = () => {
    const title = docName || "Document";
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;color:#111;font-size:13px;line-height:1.75;}
h1,h2,h3{font-family:Arial,sans-serif;}pre{white-space:pre-wrap;font-family:inherit;}
table{border-collapse:collapse;width:100%;margin:12px 0;}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:12px;}
th{background:#f5f5f5;font-weight:bold;}hr{border:1px solid #ddd;margin:24px 0;}
blockquote{border-left:3px solid #ccc;margin:0;padding-left:16px;color:#555;}
code{background:#f5f5f5;padding:1px 4px;border-radius:3px;font-size:12px;}
@media print{body{margin:20px;}@page{margin:2cm;}}</style></head>
<body><pre>${content.replace(/</g, "&lt;")}</pre>
<script>window.onload=()=>{window.print();}<\/script></body></html>`);
    win.document.close();
  };

  const copyContent = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewHtml = useMemo(() => renderMarkdown(content), [content]);

  const isActive = (isNew || isEditing || !!selectedFile);
  const canEdit = isNew || isEditing || !!editingDbId;

  const totalDocs = allFolders.reduce((a, f) => a + f.files.length, 0);

  if (!isSuperAdmin()) return null;

  return (
    <AdminShell title="Document Studio">
      {showTemplates && <TemplateGallery onSelect={useTemplate} onClose={() => setShowTemplates(false)} />}
      {showSign && selectedFile && <SignatureModal file={selectedFile} content={content} onClose={() => setShowSign(false)} />}
      {deleteTarget && <DeleteConfirm file={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} deleting={deleting} />}

      <div className={cn("flex gap-4", fullscreen ? "h-screen fixed inset-0 z-30 bg-bg p-4" : "h-[calc(100vh-120px)]")}>

        {/* Left Sidebar — Document Tree */}
        {!fullscreen && (
          <div className="w-72 flex-shrink-0 bg-bg2 border border-border rounded-xl flex flex-col overflow-hidden">
            {/* Sidebar header */}
            <div className="px-3 py-3 border-b border-border flex-shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-extrabold text-text flex items-center gap-1.5"><Crown size={12} className="text-purple" />Document Studio</p>
                  <p className="text-[10px] text-textDim">{totalDocs} documents</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowTemplates(true)} title="Templates" className="p-1.5 rounded-lg bg-purple/10 border border-purple/20 text-purple hover:bg-purple/20 transition-all"><Layers size={12} /></button>
                  <button onClick={startNew} title="New document" className="p-1.5 rounded-lg bg-cyan/10 border border-cyan/20 text-cyan hover:bg-cyan/20 transition-all"><FilePlus size={12} /></button>
                </div>
              </div>
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textDim" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…" className="w-full bg-bg border border-border rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-text placeholder:text-textDim focus:outline-none focus:border-cyan" />
                {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-textDim hover:text-text"><X size={10} /></button>}
              </div>
            </div>

            {/* Folder tree */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <div className="flex items-center justify-center h-32 gap-2"><Spinner /><span className="text-xs text-textMuted">Loading...</span></div>
              ) : allFolders.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-textMuted text-xs">No documents found</p>
                  <button onClick={startNew} className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg bg-cyan/10 border border-cyan/20 text-xs text-cyan font-bold"><Plus size={11} />Create First Document</button>
                </div>
              ) : (
                <>
                  {allFolders.map(folder => (
                    <FolderSection key={folder.id} folder={folder} selectedFile={selectedFile} onSelectFile={loadDoc} searchQuery={search} onEdit={openEdit} onDelete={setDeleteTarget} />
                  ))}
                  <div className="pt-2">
                    <button onClick={startNew} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border hover:border-cyan text-[11px] font-semibold text-textDim hover:text-cyan transition-all">
                      <Plus size={11} />New Document
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main editor area */}
        <div className="flex-1 bg-bg2 border border-border rounded-xl flex flex-col overflow-hidden min-w-0">

          {/* Top bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0 gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {fullscreen && (
                <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-lg bg-bg3 border border-border text-textMuted hover:text-text"><Minimize2 size={14} /></button>
              )}
              {(isNew || isEditing) ? (
                <input
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  placeholder="Document name..."
                  className="flex-1 min-w-0 bg-transparent text-sm font-bold text-text placeholder:text-textDim focus:outline-none border-b border-border focus:border-cyan pb-0.5 transition-colors"
                />
              ) : selectedFile ? (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text truncate">{selectedFile.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <AccessBadge level={selectedFile.accessLevel} />
                    {selectedFile.updatedAt && <span className="text-[10px] text-textDim">Updated {new Date(selectedFile.updatedAt).toLocaleDateString("en-ZA")}</span>}
                    {selectedFile.version && selectedFile.version > 1 && <span className="text-[10px] text-textDim">v{selectedFile.version}</span>}
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-text flex items-center gap-2"><Crown size={14} className="text-purple" />Superadmin Document Studio</p>
                  <p className="text-[11px] text-textMuted">Select a document or create a new one</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
              {isActive && (
                <>
                  {isDirty && (
                    <span className="text-[10px] text-yellow flex items-center gap-1 mr-1"><CheckCircle size={9} />Unsaved changes</span>
                  )}
                  <button onClick={() => setShowTemplates(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple/10 border border-purple/20 text-xs font-bold text-purple hover:bg-purple/20 transition-all">
                    <Layers size={12} />Templates
                  </button>
                  <button onClick={() => setShowSign(true)} disabled={!content} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg3 border border-border text-xs font-medium text-textMuted hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-40">
                    <PenLine size={12} />Sign
                  </button>
                  <button onClick={printDoc} disabled={!content} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg3 border border-border text-xs font-medium text-textMuted hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-40">
                    <Printer size={12} />Print
                  </button>
                  <button onClick={copyContent} disabled={!content} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg3 border border-border text-xs font-medium text-textMuted hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-40">
                    {copied ? <CheckCheck size={12} className="text-green" /> : <Copy size={12} />}{copied ? "Copied" : "Copy"}
                  </button>
                  <button onClick={downloadDoc} disabled={!content} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg3 border border-border text-xs font-medium text-textMuted hover:text-cyan hover:border-cyan/30 transition-all disabled:opacity-40">
                    <Download size={12} />Download
                  </button>
                  <button onClick={handleSave} disabled={saving || (!isDirty && !isNew)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan text-bg text-xs font-bold hover:bg-cyan/90 transition-all disabled:opacity-50">
                    {saving ? <><Spinner size={11} /><span>Saving…</span></> : <><Save size={12} />Save</>}
                  </button>
                </>
              )}
              <button onClick={() => setFullscreen(f => !f)} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="p-1.5 rounded-lg bg-bg3 border border-border text-textMuted hover:text-text transition-all">
                {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </div>
          </div>

          {/* Metadata row (for new/edit) */}
          {(isNew || isEditing) && (
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg3/50 flex-shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-extrabold text-textDim uppercase tracking-wider">Folder:</label>
                <select value={docFolder} onChange={e => setDocFolder(e.target.value)} disabled={!isNew} className="bg-bg border border-border rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-cyan disabled:opacity-60">
                  <option value="">Select folder…</option>
                  {Object.entries(FOLDER_META).map(([id, meta]) => (
                    <option key={id} value={id}>{meta.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-extrabold text-textDim uppercase tracking-wider">Access:</label>
                <select value={accessLevel} onChange={e => setAccessLevel(e.target.value as AccessLevel)} className="bg-bg border border-border rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-cyan">
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                  <option value="public">Public</option>
                </select>
              </div>
              <span className="text-[10px] text-textDim ml-auto">⌘S to save · ⌘B bold · ⌘I italic · Tab to indent</span>
            </div>
          )}

          {/* Formatting toolbar */}
          {(isNew || isEditing) && (
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border flex-shrink-0 flex-wrap bg-bg3/30">
              <ToolbarBtn icon={Heading1} label="Heading 1" onClick={() => insertText("\n# ", "", "Heading 1")} />
              <ToolbarBtn icon={Heading2} label="Heading 2" onClick={() => insertText("\n## ", "", "Heading 2")} />
              <ToolbarBtn icon={Heading3} label="Heading 3" onClick={() => insertText("\n### ", "", "Heading 3")} />
              <div className="w-px h-4 bg-border mx-1" />
              <ToolbarBtn icon={Bold} label="Bold (⌘B)" onClick={() => insertText("**", "**", "bold text")} />
              <ToolbarBtn icon={Italic} label="Italic (⌘I)" onClick={() => insertText("*", "*", "italic text")} />
              <ToolbarBtn icon={Strikethrough} label="Strikethrough" onClick={() => insertText("~~", "~~", "strikethrough")} />
              <ToolbarBtn icon={Code} label="Inline Code" onClick={() => insertText("`", "`", "code")} />
              <div className="w-px h-4 bg-border mx-1" />
              <ToolbarBtn icon={List} label="Bullet List" onClick={() => insertText("\n- ", "", "list item")} />
              <ToolbarBtn icon={ListOrdered} label="Numbered List" onClick={() => insertText("\n1. ", "", "list item")} />
              <ToolbarBtn icon={Quote} label="Blockquote" onClick={() => insertText("\n> ", "", "quote")} />
              <div className="w-px h-4 bg-border mx-1" />
              <ToolbarBtn icon={TableIcon} label="Insert Table" onClick={() => insertText("\n| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell 1   | Cell 2   | Cell 3   |\n")} />
              <ToolbarBtn icon={Minus} label="Horizontal Rule" onClick={() => insertText("\n---\n")} />
              <ToolbarBtn icon={Link} label="Insert Link" onClick={() => insertText("[", "](url)", "link text")} />
              <div className="w-px h-4 bg-border mx-1" />
              <div className="flex items-center gap-1 ml-1">
                {(["edit", "split", "preview"] as ViewMode[]).map(m => (
                  <button key={m} onClick={() => setViewMode(m)} className={cn("px-2 py-0.5 rounded text-[10px] font-bold transition-all", viewMode === m ? "bg-cyan/10 text-cyan border border-cyan/20" : "text-textDim hover:text-text")}>
                    {m === "edit" ? "Edit" : m === "preview" ? "Preview" : "Split"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* View mode toggles for read-only view */}
          {selectedFile && !isNew && !isEditing && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
              {(["edit", "split", "preview"] as ViewMode[]).map(m => (
                <button key={m} onClick={() => setViewMode(m)} className={cn("px-2.5 py-1 rounded text-[10px] font-bold transition-all", viewMode === m ? "bg-cyan/10 text-cyan border border-cyan/20" : "text-textDim hover:text-text")}>
                  {m === "edit" ? "Raw" : m === "preview" ? "Preview" : "Split"}
                </button>
              ))}
              <div className="ml-auto">
                <DocStats content={content} />
              </div>
            </div>
          )}

          {/* Editor / Preview area */}
          <div className="flex-1 overflow-hidden flex">
            {docLoading ? (
              <div className="flex items-center justify-center flex-1 gap-3"><Spinner /><span className="text-sm text-textMuted">Loading document…</span></div>
            ) : docError ? (
              <div className="flex items-start gap-3 p-6 flex-1">
                <AlertTriangle size={16} className="text-yellow flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-yellow">Document unavailable</p>
                  <p className="text-xs text-textMuted mt-1">{docError}</p>
                </div>
              </div>
            ) : !isActive ? (
              /* Welcome screen */
              <div className="flex flex-col items-center justify-center flex-1 gap-5 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-purple/10 border border-purple/20 flex items-center justify-center">
                  <Crown size={28} className="text-purple" />
                </div>
                <div>
                  <p className="text-base font-extrabold text-text">Document Studio</p>
                  <p className="text-sm text-textMuted mt-1 max-w-sm">Create, edit, and manage company documents with the advanced editor. Select a document from the tree or start fresh.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan/10 border border-cyan/30 hover:bg-cyan/20 text-sm font-bold text-cyan transition-all">
                    <FilePlus size={14} />New Document
                  </button>
                  <button onClick={() => setShowTemplates(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple/10 border border-purple/20 hover:bg-purple/20 text-sm font-bold text-purple transition-all">
                    <Layers size={14} />Browse Templates
                  </button>
                </div>

                {/* Feature grid */}
                <div className="grid grid-cols-3 gap-3 mt-4 w-full max-w-xl text-left">
                  {[
                    { icon: Sparkles, title: "12 Templates", desc: "Employment contracts, NDAs, board resolutions & more", color: "text-purple bg-purple/10 border-purple/20" },
                    { icon: Columns, title: "Split Preview", desc: "Edit markdown with live rendered preview side-by-side", color: "text-cyan bg-cyan/10 border-cyan/20" },
                    { icon: FileSignature, title: "E-Signature", desc: "Draw and embed electronic signatures in any document", color: "text-green bg-green/10 border-green/20" },
                    { icon: Lock, title: "Access Levels", desc: "Control who can see each document — public to restricted", color: "text-yellow bg-yellow/10 border-yellow/20" },
                    { icon: Download, title: "Export & Print", desc: "Download as markdown or print to PDF via browser", color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
                    { icon: Database, title: "Database Backed", desc: "Documents stored in DB with version tracking", color: "text-green bg-green/10 border-green/20" },
                  ].map(f => (
                    <div key={f.title} className={cn("rounded-xl border p-3", f.color)}>
                      <f.icon size={14} className="mb-1.5" />
                      <p className="text-xs font-bold">{f.title}</p>
                      <p className="text-[10px] opacity-70 mt-0.5 leading-relaxed">{f.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Editor + Preview split */
              <div className={cn("flex flex-1 overflow-hidden", viewMode === "split" ? "divide-x divide-border" : "")}>

                {/* Editor pane */}
                {(viewMode === "edit" || viewMode === "split") && (
                  <div className={cn("flex flex-col", viewMode === "split" ? "w-1/2" : "w-full")}>
                    <textarea
                      ref={editorRef}
                      value={content}
                      onChange={e => setContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={"# Document Title\n\nStart writing in Markdown format...\n\nUse ## for section headings, **bold**, *italic*, and | tables |."}
                      className="flex-1 w-full bg-transparent px-5 py-4 text-[12.5px] font-mono text-text placeholder:text-textDim focus:outline-none resize-none leading-relaxed"
                      spellCheck={false}
                    />
                    {(isNew || isEditing) && (
                      <div className="px-4 py-1.5 border-t border-border flex-shrink-0">
                        <DocStats content={content} />
                      </div>
                    )}
                  </div>
                )}

                {/* Preview pane */}
                {(viewMode === "preview" || viewMode === "split") && (
                  <div className={cn("overflow-auto", viewMode === "split" ? "w-1/2" : "w-full")}>
                    {content ? (
                      <div
                        className="px-6 py-5 prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                        style={{
                          color: "var(--text)",
                          fontSize: "13px",
                          lineHeight: "1.75",
                        }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-textDim text-sm">
                        <span>Preview will appear here as you type</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview styles */}
      <style>{`
        .md-preview h1 { font-size: 1.5em; font-weight: 800; margin: 1em 0 0.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
        .md-preview h2 { font-size: 1.25em; font-weight: 700; margin: 0.8em 0 0.4em; }
        .md-preview h3 { font-size: 1.1em; font-weight: 700; margin: 0.7em 0 0.3em; }
        .md-preview h4, .md-preview h5, .md-preview h6 { font-weight: 700; margin: 0.5em 0 0.25em; }
        .md-preview strong { font-weight: 700; }
        .md-preview em { font-style: italic; }
        .md-preview del { text-decoration: line-through; opacity: 0.6; }
        .md-preview code { background: var(--bg3); padding: 1px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
        .md-preview pre { background: var(--bg3); border: 1px solid var(--border); padding: 12px 16px; border-radius: 8px; overflow-x: auto; margin: 8px 0; }
        .md-preview pre code { background: none; padding: 0; }
        .md-preview blockquote { border-left: 3px solid var(--border); margin: 8px 0; padding-left: 12px; color: var(--textMuted); }
        .md-preview ul { list-style: disc; padding-left: 20px; margin: 6px 0; }
        .md-preview ol { list-style: decimal; padding-left: 20px; margin: 6px 0; }
        .md-preview li { margin: 2px 0; }
        .md-preview table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .md-preview th, .md-preview td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; font-size: 12px; }
        .md-preview th { background: var(--bg3); font-weight: 700; }
        .md-preview hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
        .md-preview a { color: var(--cyan); text-decoration: underline; }
        .md-preview p { margin: 6px 0; }
      `}</style>
    </AdminShell>
  );
}
