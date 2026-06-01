import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, extname, basename } from "path";

const DOCS_ROOT = join(process.cwd(), "..", "company-docs");
const BACKEND   = "https://tag-n-ride-production.up.railway.app";

export interface DocFile {
  dbId?: string;
  name: string;
  path: string;
  category: string;
  folder: string;
  fileName?: string;
  size?: number;
  accessLevel: "public" | "internal" | "confidential" | "restricted";
  version?: number;
  updatedAt?: string;
}

export interface DocFolder {
  id: string;
  label: string;
  color: string;
  files: DocFile[];
}

const ACCESS_LEVELS: Record<string, DocFile["accessLevel"]> = {
  "01-legal-incorporation":     "restricted",
  "02-equity-and-shares":       "restricted",
  "03-investor-documents":      "restricted",
  "04-hr-documents":            "confidential",
  "05-company-policies":        "internal",
  "06-fintech-regulatory":      "confidential",
  "07-marketing":               "internal",
  "08-daily-use":               "internal",
  "09-tax-sars":                "restricted",
  "10-business-agreements":     "restricted",
  "11-financial-management":    "restricted",
  "12-corporate-governance":    "restricted",
  "13-taxi-associations":       "restricted",
  "14-tender-documents":        "restricted",
  "15-legal-documents":         "restricted",
  "16-appointments-promotions": "confidential",
};

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

// ── DB doc fetch ─────────────────────────────────────────────

async function fetchDbDocs(token: string | null): Promise<Record<string, DocFile[]>> {
  if (!token) return {};
  try {
    const res = await fetch(`${BACKEND}/api/admin/documents`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return {};
    const data = await res.json();
    // data.documents: { [folderId]: DocFile[] }
    const out: Record<string, DocFile[]> = {};
    for (const [folderId, docs] of Object.entries(data.documents as Record<string, any[]>)) {
      const meta = FOLDER_META[folderId];
      if (!meta) continue;
      out[folderId] = docs.map(d => ({
        dbId:        d.dbId,
        name:        d.name,
        path:        d.path,
        folder:      folderId,
        fileName:    d.fileName,
        category:    meta.label,
        accessLevel: d.accessLevel as DocFile["accessLevel"],
        version:     d.version,
        updatedAt:   d.updatedAt,
      }));
    }
    return out;
  } catch {
    return {};
  }
}

// ── Filesystem catalog ───────────────────────────────────────

async function buildFsFolder(folderName: string): Promise<DocFile[]> {
  const meta = FOLDER_META[folderName];
  if (!meta) return [];
  const folderPath = join(DOCS_ROOT, folderName);
  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const files: DocFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || extname(entry.name) !== ".md") continue;
      const filePath = join(folderPath, entry.name);
      let size: number | undefined;
      try { size = (await stat(filePath)).size; } catch {}
      files.push({
        name:        basename(entry.name, ".md").replace(/-/g, " "),
        path:        `${folderName}/${entry.name}`,
        category:    meta.label,
        folder:      folderName,
        fileName:    entry.name,
        size,
        accessLevel: ACCESS_LEVELS[folderName] ?? "internal",
      });
    }
    return files;
  } catch {
    return STATIC_CATALOG.find(f => f.id === folderName)?.files ?? [];
  }
}

// ── Merge: DB overrides filesystem by matching path ──────────

function mergeFolders(
  fsFolders: DocFolder[],
  dbDocs: Record<string, DocFile[]>,
): DocFolder[] {
  // Build path → dbDoc map
  const dbByPath = new Map<string, DocFile>();
  for (const docs of Object.values(dbDocs)) {
    for (const doc of docs) dbByPath.set(doc.path, doc);
  }

  // Merge: filesystem base, DB overrides
  const folderMap = new Map<string, DocFolder>();
  for (const folder of fsFolders) {
    folderMap.set(folder.id, {
      ...folder,
      files: folder.files.map(f => dbByPath.get(f.path) ?? f),
    });
  }

  // Add any DB docs that aren't in filesystem (purely DB-created)
  for (const [folderId, docs] of Object.entries(dbDocs)) {
    const meta = FOLDER_META[folderId];
    if (!meta) continue;
    let folder = folderMap.get(folderId);
    if (!folder) {
      folder = { id: folderId, label: meta.label, color: meta.color, files: [] };
      folderMap.set(folderId, folder);
    }
    for (const doc of docs) {
      const exists = folder.files.some(f => f.path === doc.path);
      if (!exists) folder.files.push(doc);
    }
  }

  // Return in canonical order
  return Object.keys(FOLDER_META)
    .map(id => folderMap.get(id))
    .filter(Boolean) as DocFolder[];
}

// ── GET ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;

  try {
    const [dbDocs, folders] = await Promise.all([
      fetchDbDocs(token),
      (async () => {
        const entries = await readdir(DOCS_ROOT, { withFileTypes: true });
        const out: DocFolder[] = [];
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const meta = FOLDER_META[entry.name];
          if (!meta) continue;
          out.push({
            id:     entry.name,
            label:  meta.label,
            color:  meta.color,
            files:  await buildFsFolder(entry.name),
          });
        }
        return out;
      })(),
    ]);

    return NextResponse.json({ folders: mergeFolders(folders, dbDocs) });
  } catch {
    // Fallback: try DB only, then static
    const dbDocs = await fetchDbDocs(token);
    const hasDocs = Object.values(dbDocs).some(d => d.length > 0);
    if (hasDocs) {
      const folders = mergeFolders(STATIC_CATALOG, dbDocs);
      return NextResponse.json({ folders });
    }
    return NextResponse.json({ folders: STATIC_CATALOG });
  }
}

// ── POST (create) ────────────────────────────────────────────

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const res = await fetch(`${BACKEND}/api/admin/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

// ── Static fallback catalog ──────────────────────────────────

const STATIC_CATALOG: DocFolder[] = [
  {
    id: "01-legal-incorporation", label: "Legal & Incorporation", color: "purple",
    files: [
      { name: "MOI Memorandum of Incorporation", path: "01-legal-incorporation/MOI-Memorandum-of-Incorporation.md", category: "Legal & Incorporation", folder: "01-legal-incorporation", accessLevel: "restricted" },
      { name: "Shareholders Agreement",          path: "01-legal-incorporation/Shareholders-Agreement.md",          category: "Legal & Incorporation", folder: "01-legal-incorporation", accessLevel: "restricted" },
      { name: "Co Founder Agreement",            path: "01-legal-incorporation/Co-Founder-Agreement.md",            category: "Legal & Incorporation", folder: "01-legal-incorporation", accessLevel: "restricted" },
    ],
  },
  {
    id: "02-equity-and-shares", label: "Equity & Shares", color: "yellow",
    files: [
      { name: "ESOP Employee Share Option Plan", path: "02-equity-and-shares/ESOP-Employee-Share-Option-Plan.md", category: "Equity & Shares", folder: "02-equity-and-shares", accessLevel: "restricted" },
      { name: "Option Grant Letter Template",    path: "02-equity-and-shares/Option-Grant-Letter-Template.md",    category: "Equity & Shares", folder: "02-equity-and-shares", accessLevel: "restricted" },
    ],
  },
  {
    id: "03-investor-documents", label: "Investor Documents", color: "cyan",
    files: [
      { name: "Term Sheet",                path: "03-investor-documents/Term-Sheet.md",                category: "Investor Documents", folder: "03-investor-documents", accessLevel: "restricted" },
      { name: "SAFE Note",                 path: "03-investor-documents/SAFE-Note.md",                 category: "Investor Documents", folder: "03-investor-documents", accessLevel: "restricted" },
      { name: "Investor Rights Agreement", path: "03-investor-documents/Investor-Rights-Agreement.md", category: "Investor Documents", folder: "03-investor-documents", accessLevel: "restricted" },
    ],
  },
  {
    id: "04-hr-documents", label: "Human Resources", color: "green",
    files: [
      { name: "Employment Contract Standard",  path: "04-hr-documents/Employment-Contract-Standard.md",  category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "Employee Handbook",             path: "04-hr-documents/Employee-Handbook.md",             category: "Human Resources", folder: "04-hr-documents", accessLevel: "internal" },
      { name: "NDA Confidentiality Agreement", path: "04-hr-documents/NDA-Confidentiality-Agreement.md", category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "IP Assignment Agreement",       path: "04-hr-documents/IP-Assignment-Agreement.md",       category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "Job Description Template",      path: "04-hr-documents/Job-Description-Template.md",      category: "Human Resources", folder: "04-hr-documents", accessLevel: "internal" },
      { name: "Warning Letter Written",        path: "04-hr-documents/Warning-Letter-Written.md",        category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "Final Warning Letter",          path: "04-hr-documents/Final-Warning-Letter.md",          category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "Disciplinary Hearing Notice",   path: "04-hr-documents/Disciplinary-Hearing-Notice.md",   category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "Termination Letter",            path: "04-hr-documents/Termination-Letter.md",            category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
      { name: "Employment Certificate",        path: "04-hr-documents/Employment-Certificate.md",        category: "Human Resources", folder: "04-hr-documents", accessLevel: "confidential" },
    ],
  },
  {
    id: "05-company-policies", label: "Company Policies", color: "orange",
    files: [
      { name: "Code of Conduct",       path: "05-company-policies/Code-of-Conduct.md",       category: "Company Policies", folder: "05-company-policies", accessLevel: "internal" },
      { name: "Company Policy Manual", path: "05-company-policies/Company-Policy-Manual.md", category: "Company Policies", folder: "05-company-policies", accessLevel: "internal" },
    ],
  },
  {
    id: "06-fintech-regulatory", label: "Fintech & Regulatory", color: "red",
    files: [
      { name: "POPIA Privacy Policy",          path: "06-fintech-regulatory/POPIA-Privacy-Policy.md",          category: "Fintech & Regulatory", folder: "06-fintech-regulatory", accessLevel: "confidential" },
      { name: "Terms of Service",              path: "06-fintech-regulatory/Terms-of-Service.md",              category: "Fintech & Regulatory", folder: "06-fintech-regulatory", accessLevel: "internal" },
      { name: "FICA AML KYC Compliance Policy",path: "06-fintech-regulatory/FICA-AML-KYC-Compliance-Policy.md",category: "Fintech & Regulatory", folder: "06-fintech-regulatory", accessLevel: "confidential" },
      { name: "Incident Response Policy",      path: "06-fintech-regulatory/Incident-Response-Policy.md",      category: "Fintech & Regulatory", folder: "06-fintech-regulatory", accessLevel: "confidential" },
    ],
  },
  {
    id: "07-marketing", label: "Marketing", color: "pink",
    files: [
      { name: "Brand Guidelines",                      path: "07-marketing/Brand-Guidelines.md",                      category: "Marketing", folder: "07-marketing", accessLevel: "internal" },
      { name: "Marketing Policy",                      path: "07-marketing/Marketing-Policy.md",                      category: "Marketing", folder: "07-marketing", accessLevel: "internal" },
      { name: "Influencer Partnership Agreement Template", path: "07-marketing/Influencer-Partnership-Agreement-Template.md", category: "Marketing", folder: "07-marketing", accessLevel: "internal" },
    ],
  },
  {
    id: "08-daily-use", label: "Daily Use Templates", color: "blue",
    files: [
      { name: "Board Resolution Template",      path: "08-daily-use/Board-Resolution-Template.md",      category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "internal" },
      { name: "Meeting Minutes Template",        path: "08-daily-use/Meeting-Minutes-Template.md",        category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "internal" },
      { name: "Offer Letter Template",           path: "08-daily-use/Offer-Letter-Template.md",           category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "confidential" },
      { name: "Contractor Freelancer Agreement", path: "08-daily-use/Contractor-Freelancer-Agreement.md", category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "confidential" },
      { name: "Expense Claim Form",              path: "08-daily-use/Expense-Claim-Form.md",              category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "internal" },
      { name: "Performance Review Template",     path: "08-daily-use/Performance-Review-Template.md",     category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "confidential" },
      { name: "Leave Application Form",          path: "08-daily-use/Leave-Application-Form.md",          category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "internal" },
      { name: "Probation Review Form",           path: "08-daily-use/Probation-Review-Form.md",           category: "Daily Use Templates", folder: "08-daily-use", accessLevel: "confidential" },
    ],
  },
  {
    id: "09-tax-sars", label: "Tax & SARS", color: "yellow",
    files: [
      { name: "SARS VAT Registration Checklist",    path: "09-tax-sars/SARS-VAT-Registration-Checklist.md",    category: "Tax & SARS", folder: "09-tax-sars", accessLevel: "restricted" },
      { name: "PAYE UIF SDL Employer Registration", path: "09-tax-sars/PAYE-UIF-SDL-Employer-Registration.md", category: "Tax & SARS", folder: "09-tax-sars", accessLevel: "restricted" },
      { name: "Provisional Tax IRP6 Guide",         path: "09-tax-sars/Provisional-Tax-IRP6-Guide.md",         category: "Tax & SARS", folder: "09-tax-sars", accessLevel: "restricted" },
      { name: "Tax Compliance Status PIN",          path: "09-tax-sars/Tax-Compliance-Status-PIN.md",          category: "Tax & SARS", folder: "09-tax-sars", accessLevel: "restricted" },
      { name: "Annual Financial Statements Template",path: "09-tax-sars/Annual-Financial-Statements-Template.md",category: "Tax & SARS", folder: "09-tax-sars", accessLevel: "restricted" },
      { name: "Dividends Tax Declaration",          path: "09-tax-sars/Dividends-Tax-Declaration.md",          category: "Tax & SARS", folder: "09-tax-sars", accessLevel: "restricted" },
    ],
  },
  {
    id: "10-business-agreements", label: "Business Agreements", color: "orange",
    files: [
      { name: "MOU Memorandum of Understanding",  path: "10-business-agreements/MOU-Memorandum-of-Understanding.md",  category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "Letter of Intent",                 path: "10-business-agreements/Letter-of-Intent.md",                 category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "Service Level Agreement",          path: "10-business-agreements/Service-Level-Agreement.md",          category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "Vendor Supplier Agreement",        path: "10-business-agreements/Vendor-Supplier-Agreement.md",        category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "Technology Partnership Agreement", path: "10-business-agreements/Technology-Partnership-Agreement.md", category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "API Integration Agreement",        path: "10-business-agreements/API-Integration-Agreement.md",        category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "Data Processing Agreement POPIA",  path: "10-business-agreements/Data-Processing-Agreement-POPIA.md",  category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
      { name: "Mutual NDA Business Partner",      path: "10-business-agreements/Mutual-NDA-Business-Partner.md",      category: "Business Agreements", folder: "10-business-agreements", accessLevel: "restricted" },
    ],
  },
  {
    id: "11-financial-management", label: "Financial Management", color: "green",
    files: [
      { name: "Cap Table Template",          path: "11-financial-management/Cap-Table-Template.md",          category: "Financial Management", folder: "11-financial-management", accessLevel: "restricted" },
      { name: "Annual Budget Template",      path: "11-financial-management/Annual-Budget-Template.md",      category: "Financial Management", folder: "11-financial-management", accessLevel: "restricted" },
      { name: "Cash Flow Forecast Template", path: "11-financial-management/Cash-Flow-Forecast-Template.md", category: "Financial Management", folder: "11-financial-management", accessLevel: "restricted" },
      { name: "Due Diligence Checklist",     path: "11-financial-management/Due-Diligence-Checklist.md",     category: "Financial Management", folder: "11-financial-management", accessLevel: "restricted" },
      { name: "Dividend Policy",             path: "11-financial-management/Dividend-Policy.md",             category: "Financial Management", folder: "11-financial-management", accessLevel: "restricted" },
    ],
  },
  {
    id: "12-corporate-governance", label: "Corporate Governance", color: "purple",
    files: [
      { name: "Director Service Agreement",        path: "12-corporate-governance/Director-Service-Agreement.md",        category: "Corporate Governance", folder: "12-corporate-governance", accessLevel: "restricted" },
      { name: "General Power of Attorney",         path: "12-corporate-governance/General-Power-of-Attorney.md",         category: "Corporate Governance", folder: "12-corporate-governance", accessLevel: "restricted" },
      { name: "Bank Account Signatory Resolution", path: "12-corporate-governance/Bank-Account-Signatory-Resolution.md", category: "Corporate Governance", folder: "12-corporate-governance", accessLevel: "restricted" },
      { name: "CIPC Annual Return Checklist",      path: "12-corporate-governance/CIPC-Annual-Return-Checklist.md",      category: "Corporate Governance", folder: "12-corporate-governance", accessLevel: "restricted" },
      { name: "Signing Authority Matrix",          path: "12-corporate-governance/Signing-Authority-Matrix.md",          category: "Corporate Governance", folder: "12-corporate-governance", accessLevel: "restricted" },
    ],
  },
  {
    id: "13-taxi-associations", label: "Taxi Associations", color: "orange",
    files: [
      { name: "Taxi Association Partnership Agreement", path: "13-taxi-associations/Taxi-Association-Partnership-Agreement.md", category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
      { name: "Operator Onboarding Agreement",          path: "13-taxi-associations/Operator-Onboarding-Agreement.md",          category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
      { name: "Revenue Sharing Agreement Taxi",         path: "13-taxi-associations/Revenue-Sharing-Agreement-Taxi.md",         category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
      { name: "Fleet Owner Association Agreement",      path: "13-taxi-associations/Fleet-Owner-Association-Agreement.md",      category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
      { name: "Route Authority License Agreement",      path: "13-taxi-associations/Route-Authority-License-Agreement.md",      category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
      { name: "Taxi Association Data Sharing MOU",      path: "13-taxi-associations/Taxi-Association-Data-Sharing-MOU.md",      category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
      { name: "Taxi Industry Code of Conduct",          path: "13-taxi-associations/Taxi-Industry-Code-of-Conduct.md",          category: "Taxi Associations", folder: "13-taxi-associations", accessLevel: "restricted" },
    ],
  },
  {
    id: "14-tender-documents", label: "Tender Documents", color: "red",
    files: [
      { name: "Company Profile Document",       path: "14-tender-documents/Company-Profile-Document.md",       category: "Tender Documents", folder: "14-tender-documents", accessLevel: "restricted" },
      { name: "Tender Proposal Template",       path: "14-tender-documents/Tender-Proposal-Template.md",       category: "Tender Documents", folder: "14-tender-documents", accessLevel: "restricted" },
      { name: "Tender Pricing Schedule",        path: "14-tender-documents/Tender-Pricing-Schedule.md",        category: "Tender Documents", folder: "14-tender-documents", accessLevel: "restricted" },
      { name: "BEE Compliance Declaration",     path: "14-tender-documents/BEE-Compliance-Declaration.md",     category: "Tender Documents", folder: "14-tender-documents", accessLevel: "restricted" },
      { name: "Non Collusion Declaration",      path: "14-tender-documents/Non-Collusion-Declaration.md",      category: "Tender Documents", folder: "14-tender-documents", accessLevel: "restricted" },
      { name: "Tax Clearance Tender Declaration",path: "14-tender-documents/Tax-Clearance-Tender-Declaration.md",category: "Tender Documents", folder: "14-tender-documents", accessLevel: "restricted" },
    ],
  },
  {
    id: "15-legal-documents", label: "Legal Documents", color: "purple",
    files: [
      { name: "General Terms and Conditions", path: "15-legal-documents/General-Terms-and-Conditions.md", category: "Legal Documents", folder: "15-legal-documents", accessLevel: "restricted" },
      { name: "Indemnity Agreement",          path: "15-legal-documents/Indemnity-Agreement.md",          category: "Legal Documents", folder: "15-legal-documents", accessLevel: "restricted" },
      { name: "Guarantee and Surety",         path: "15-legal-documents/Guarantee-and-Surety.md",         category: "Legal Documents", folder: "15-legal-documents", accessLevel: "restricted" },
      { name: "Cease and Desist Notice",      path: "15-legal-documents/Cease-and-Desist-Notice.md",      category: "Legal Documents", folder: "15-legal-documents", accessLevel: "restricted" },
      { name: "Settlement Agreement",         path: "15-legal-documents/Settlement-Agreement.md",         category: "Legal Documents", folder: "15-legal-documents", accessLevel: "restricted" },
      { name: "Litigation Hold Notice",       path: "15-legal-documents/Litigation-Hold-Notice.md",       category: "Legal Documents", folder: "15-legal-documents", accessLevel: "restricted" },
    ],
  },
  {
    id: "16-appointments-promotions", label: "Appointments & Promotions", color: "green",
    files: [
      { name: "Board Director Appointment Letter", path: "16-appointments-promotions/Board-Director-Appointment-Letter.md", category: "Appointments & Promotions", folder: "16-appointments-promotions", accessLevel: "confidential" },
      { name: "Employee Promotion Letter",         path: "16-appointments-promotions/Employee-Promotion-Letter.md",         category: "Appointments & Promotions", folder: "16-appointments-promotions", accessLevel: "confidential" },
      { name: "Acting Appointment Letter",         path: "16-appointments-promotions/Acting-Appointment-Letter.md",         category: "Appointments & Promotions", folder: "16-appointments-promotions", accessLevel: "confidential" },
      { name: "Consultant Appointment Letter",     path: "16-appointments-promotions/Consultant-Appointment-Letter.md",     category: "Appointments & Promotions", folder: "16-appointments-promotions", accessLevel: "confidential" },
      { name: "Committee Appointment Letter",      path: "16-appointments-promotions/Committee-Appointment-Letter.md",      category: "Appointments & Promotions", folder: "16-appointments-promotions", accessLevel: "confidential" },
    ],
  },
];
