"use client";
import { useState, useRef, useEffect } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Search, ChevronDown, ChevronRight,
  LayoutDashboard, Bell, ArrowLeftRight, FileText,
  Users, Car, Truck, Users2, Fingerprint, UserCheck,
  Repeat2, Percent, PieChart, BarChart3, FileWarning, MinusCircle, Building2,
  Landmark, Scale, Wallet, TrendingUp, BookOpen, RefreshCw, RotateCcw,
  AlertOctagon, Banknote, Calculator, Tag, Settings, DollarSign, Download,
  Activity, Shield, AlertTriangle, FolderLock,
  ClipboardList, ShieldAlert, Gauge, Zap, ShieldCheck,
  Megaphone, MessageCircle, Mail, Target, Star,
  HelpCircle, Terminal, Database, Rocket, Brain,
  MapPin, Globe, Cpu, Monitor,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type ManualEntry = {
  id: string;
  title: string;
  icon: any;
  path?: string;
  what: string;
  who?: string;
  features: { label: string; detail: string }[];
};

type ManualSection = {
  id: string;
  label: string;
  icon: any;
  color: string;
  entries: ManualEntry[];
};

// ── Manual Content ────────────────────────────────────────────────────────────

const SECTIONS: ManualSection[] = [
  // ══════════════════════════════════════════════════════════════
  {
    id: "overview",
    label: "System Overview",
    icon: LayoutDashboard,
    color: "text-cyan",
    entries: [
      {
        id: "what-is-tnr",
        title: "What is Tag n Ride?",
        icon: LayoutDashboard,
        what: "Tag n Ride is a cashless taxi payment platform for South Africa. Passengers load money into a digital wallet, then scan or tap a driver's QR code to pay for their trip instantly. No cash changes hands — the platform handles the entire transaction flow, with real-time settlement to drivers and vehicle owners.",
        features: [
          { label: "How a trip works", detail: "1. Passenger tops up their wallet via card or EFT. 2. They board a taxi and scan the driver's QR code using the TNR app. 3. They enter the trip fare amount and confirm with their PIN. 4. The driver receives funds in their wallet immediately. 5. Earnings can be cashed out (CashUp) to the driver's bank account." },
          { label: "User roles in the app", detail: "Passenger — can top up and pay. Driver — receives payments, manages their QR card, belongs to a fleet owner and optionally a taxi association. Owner (Fleet Owner) — owns one or more vehicles/taxis, receives a share of driver earnings. Admin — manages the entire platform through this admin panel." },
          { label: "Revenue model", detail: "TNR earns platform fees on each transaction (a percentage of the payment amount), monthly subscription fees from drivers, and statement download fees. All these streams are tracked in the Revenue & P&L page." },
        ],
      },
      {
        id: "admin-roles",
        title: "Admin Roles & Permissions",
        icon: Shield,
        what: "Every admin account has a role that controls which pages and actions they can access. Roles are assigned by the Superadmin.",
        features: [
          { label: "Superadmin", detail: "Full access to everything. Can create/edit admin accounts, access System Console, Database tools, and all financial operations. There should be very few superadmin accounts." },
          { label: "CEO", detail: "Full access minus destructive system tools. Sees all financial data, HR, payroll, and analytics." },
          { label: "CFO", detail: "Full financial access — revenue, ledger, payroll, treasury, reconciliation, settlements. Also sees HR and documents." },
          { label: "CTO", detail: "Full system/technical access — console, database, health, monitoring, API keys." },
          { label: "Admin", detail: "General operations — drivers, passengers, KYC, support, disputes, transactions. No financial config." },
          { label: "Finance", detail: "Financial pages only — revenue, settlements, wallets, refunds, chargebacks, statements." },
          { label: "Support", detail: "Support-focused — lookup users, reset PINs, view tickets, view transactions." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "quick-access",
    label: "Quick Access",
    icon: LayoutDashboard,
    color: "text-cyan",
    entries: [
      {
        id: "dashboard",
        title: "Dashboard",
        icon: LayoutDashboard,
        path: "/admin/dashboard",
        what: "The first page you see after logging in. Shows a real-time snapshot of platform health — active users, today's transactions, revenue metrics, and recent alerts.",
        features: [
          { label: "Key metrics strip", detail: "Shows today's total payments processed, new registrations, active drivers, and current system wallet balance." },
          { label: "Live transaction feed", detail: "The most recent payments across the platform update in real time." },
          { label: "Alert banner", detail: "If there are critical alerts (failed transactions, KYC backlog, system errors), they appear at the top. Click to go to the Alerts page." },
          { label: "Quick links", detail: "Shortcut buttons to the most common actions — approve KYC, view flagged transactions, open support tickets." },
        ],
      },
      {
        id: "alerts",
        title: "Alerts",
        icon: Bell,
        path: "/admin/alerts",
        what: "Centralised hub for all system-generated alerts. Alerts are raised automatically when something needs admin attention — failed payments, suspicious activity, expired documents, KYC submissions, etc.",
        features: [
          { label: "Alert types", detail: "Payment failures, high-velocity transactions, expired driver documents, KYC awaiting review, driver PIN reset requests, dead man code reset requests, low system wallet balance." },
          { label: "Mark as resolved", detail: "Click an alert to see full details and mark it resolved once you have acted on it." },
          { label: "Filter by type", detail: "Use the filter tabs to view only specific alert categories." },
        ],
      },
      {
        id: "transactions",
        title: "Transactions",
        icon: ArrowLeftRight,
        path: "/admin/transactions",
        what: "Full ledger of every transaction that has ever passed through the platform — payments, top-ups, refunds, subscription fees, platform fees, CashUps, statement fees.",
        features: [
          { label: "Search", detail: "Search by reference number, user name, phone number, or QR code." },
          { label: "Filter by type", detail: "Filter to show only payments, topups, refunds, subscriptions, cashouts, etc." },
          { label: "Filter by status", detail: "Completed, pending, failed, reversed." },
          { label: "Date range", detail: "Pick a custom date range to export or review specific periods." },
          { label: "Transaction detail", detail: "Click any row to expand the full transaction — sender, receiver, amounts, fees, net payout, reference, timestamp, IP address." },
          { label: "Flag / Dispute", detail: "You can flag a transaction for review or open a dispute directly from the detail view." },
        ],
      },
      {
        id: "audit",
        title: "Audit Log",
        icon: FileText,
        path: "/admin/audit",
        what: "Every action taken by every admin is recorded here. Immutable audit trail for compliance, forensics, and accountability.",
        features: [
          { label: "What is logged", detail: "Every admin login, PIN reset, KYC approval/rejection, refund, fee change, user ban, payout approval — every significant action is logged with timestamp, admin name, IP address, and before/after values." },
          { label: "Filter by admin", detail: "See only the actions taken by a specific admin account." },
          { label: "Filter by action type", detail: "Narrow down to specific event types (e.g., only KYC decisions)." },
          { label: "Export", detail: "Download audit log as CSV for external compliance reporting." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "people",
    label: "People",
    icon: Users,
    color: "text-cyan",
    entries: [
      {
        id: "users",
        title: "Users",
        icon: Users,
        path: "/admin/users",
        what: "Master list of every account on the platform — drivers, passengers, and owners. Use this page for general user lookups when you do not know the exact role.",
        features: [
          { label: "Search", detail: "Search by name, phone number, or ID number." },
          { label: "Filter by role", detail: "Show only drivers, only passengers, or only owners." },
          { label: "View profile", detail: "Click a user to open their full profile — wallet balance, KYC status, transaction history, linked accounts." },
          { label: "Suspend / Unsuspend", detail: "Temporarily block a user from transacting. They can still log in but cannot make or receive payments until unsuspended." },
          { label: "Reset PIN", detail: "Generates a temporary PIN sent to the user via WhatsApp/SMS. Requires reset_pin permission." },
        ],
      },
      {
        id: "drivers",
        title: "Drivers",
        icon: Car,
        path: "/admin/drivers",
        what: "List of all registered driver accounts. Drivers are the primary earners on the platform — they receive payments from passengers via their QR code.",
        features: [
          { label: "Driver list", detail: "Shows name, phone, vehicle plate, verification status, KYC status, total earnings, and current wallet balance." },
          { label: "Search", detail: "Search by name, phone, plate number, or TNR code." },
          { label: "Driver detail page", detail: "Click any driver to open their profile page (see Driver Detail below)." },
          { label: "Verify driver", detail: "Mark a driver as verified once their documents and KYC have been approved." },
          { label: "Export", detail: "Download the full driver list as CSV." },
        ],
      },
      {
        id: "driver-detail",
        title: "Driver Detail Page",
        icon: Car,
        path: "/admin/drivers/[id]",
        what: "Full profile for a single driver. This is the most feature-rich page in the admin — it gives you complete visibility and control over one driver account.",
        features: [
          { label: "Profile card", detail: "Name, phone, vehicle plate, KYC badge, verification badge, total earnings, star rating, TNR QR code." },
          { label: "QR Code card", detail: "Shows the driver's unique QR code (with TNR logo watermark). You can Print it (opens a print-ready card with full branding) or Download PNG for physical printing." },
          { label: "Verify Driver button", detail: "Appears if the driver is not yet verified. Click to mark them verified (they can then receive payments)." },
          { label: "Taxi Association", detail: "A dropdown to link this driver to a registered taxi association. Select the association and click Link. This is used for the association monthly payout calculations. Click Unlink (or select 'No association') to remove the link." },
          { label: "Transaction History", detail: "A table of every transaction where this driver was the sender or receiver — with reference, type, amount, net payout, counterparty, status, and date." },
          { label: "Statements sub-page", detail: "Click 'Statements' to download or view this driver's monthly earnings statements." },
        ],
      },
      {
        id: "owners",
        title: "Fleet Owners",
        icon: Truck,
        path: "/admin/owners",
        what: "Fleet owners own the taxis and employ drivers. Each driver is linked to one owner. The owner receives a commission split from driver earnings based on the configured rate.",
        features: [
          { label: "Owner list", detail: "Name, business name, email, phone, number of linked drivers, total earnings received." },
          { label: "Owner detail page", detail: "Full profile — linked drivers list, earnings history, bank account details, commission split configuration." },
          { label: "Commission rate", detail: "Set the percentage of each payment that goes to the owner vs. the driver (configured per driver via Commission Splits)." },
        ],
      },
      {
        id: "passengers",
        title: "Passengers",
        icon: Users2,
        path: "/admin/passengers",
        what: "List of all passenger accounts. Passengers top up their wallets and pay drivers.",
        features: [
          { label: "Passenger list", detail: "Name, phone, wallet balance, total amount spent, registration date." },
          { label: "View profile", detail: "Click to see transaction history, wallet balance, KYC status, and any active disputes." },
          { label: "Refund payment", detail: "If a passenger overpaid or was charged incorrectly, you can initiate a refund from their transaction history." },
        ],
      },
      {
        id: "kyc",
        title: "KYC Review",
        icon: Fingerprint,
        path: "/admin/kyc",
        what: "KYC (Know Your Customer) is the identity verification process. Drivers and owners must submit a selfie and ID document before they can transact. This page is the queue for reviewing submissions.",
        features: [
          { label: "Pending queue", detail: "Shows all KYC submissions awaiting review — thumbnail of selfie, ID document image, name, and submission date." },
          { label: "Approve", detail: "Click Approve to mark the user as KYC verified. They are then eligible to receive payments and CashOut." },
          { label: "Reject", detail: "Click Reject and provide a reason. The user is notified and can resubmit." },
          { label: "View documents", detail: "Full-size preview of the selfie and ID document before making a decision." },
          { label: "Filter by status", detail: "View pending, approved, or rejected submissions separately." },
        ],
      },
      {
        id: "onboarding",
        title: "Onboarding",
        icon: UserCheck,
        path: "/admin/onboarding",
        what: "Tracks new driver registrations through the onboarding pipeline — registered but not yet verified, KYC submitted, documents uploaded, first payment received.",
        features: [
          { label: "Onboarding funnel", detail: "Visual funnel showing how many new drivers are at each stage: Registered → KYC Submitted → KYC Approved → Verified → First Payment." },
          { label: "Driver list by stage", detail: "Filter to see exactly which drivers are stuck at each step and follow up." },
          { label: "Send reminder", detail: "Trigger a WhatsApp/notification reminder to a driver who has not completed a step." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "fleet",
    label: "Fleet",
    icon: Truck,
    color: "text-cyan",
    entries: [
      {
        id: "transfers",
        title: "Driver Transfers",
        icon: Repeat2,
        path: "/admin/transfers",
        what: "When a driver moves from one vehicle owner to another, a transfer request is created. This page manages those requests.",
        features: [
          { label: "Pending transfers", detail: "Shows all transfer requests — driver name, current owner, new owner, request date." },
          { label: "Approve transfer", detail: "Approving re-links the driver to the new owner. Future earnings split will use the new owner's commission rate." },
          { label: "Reject transfer", detail: "Reject with a reason. The driver stays with their current owner." },
          { label: "Transfer history", detail: "Full history of past transfers for auditing and dispute resolution." },
        ],
      },
      {
        id: "commissions",
        title: "Commission Splits",
        icon: Percent,
        path: "/admin/commissions",
        what: "Configures how each driver's earnings are split between the driver and their vehicle owner. You can set a custom rate per driver or apply a global default.",
        features: [
          { label: "Split list", detail: "Shows every driver-owner pair with the current split percentage (e.g., 70% driver / 30% owner)." },
          { label: "Edit split", detail: "Change the driver's percentage. Updates take effect on the next payment." },
          { label: "Global default", detail: "Set a platform-wide default split applied to all new driver-owner relationships." },
          { label: "Effective date", detail: "Optionally set a future date for a split change to take effect." },
        ],
      },
      {
        id: "performance",
        title: "Performance",
        icon: PieChart,
        path: "/admin/performance",
        what: "Analytics on driver performance — earnings, trip counts, ratings, payment volume over time. Useful for identifying top performers and underperforming drivers.",
        features: [
          { label: "Leaderboard", detail: "Ranked list of drivers by earnings, trip count, or rating for the selected period." },
          { label: "Individual trends", detail: "Click any driver to see their weekly/monthly earnings chart." },
          { label: "Rating distribution", detail: "Breakdown of star ratings across all drivers." },
          { label: "Date range", detail: "Filter all metrics to a custom period (last 7 days, 30 days, 90 days)." },
        ],
      },
      {
        id: "fleet-reports",
        title: "Fleet Reports",
        icon: BarChart3,
        path: "/admin/fleet",
        what: "Aggregated reporting for fleet owners — how many trips their vehicles made, total earnings, commission earned, driver count.",
        features: [
          { label: "Per-owner summary", detail: "Each fleet owner's total rides, gross payments, commission earned, and active driver count for the period." },
          { label: "Driver breakdown", detail: "Expand any owner to see each of their drivers' individual contributions." },
          { label: "Export", detail: "Download fleet report as CSV for owners who request statements." },
        ],
      },
      {
        id: "fleet-documents",
        title: "Document Expiry",
        icon: FileWarning,
        path: "/admin/fleet/documents",
        what: "Tracks the expiry dates of required driver and vehicle documents — operating licences, roadworthy certificates, public liability insurance, etc.",
        features: [
          { label: "Expiry calendar", detail: "Documents expiring in the next 30/60/90 days highlighted in red/yellow." },
          { label: "Filter by document type", detail: "View all drivers with a specific document type expiring soon." },
          { label: "Send reminder", detail: "Trigger a notification to the driver to renew their document before it expires." },
          { label: "Upload new document", detail: "Admin can upload a renewed document on behalf of a driver after it is submitted physically." },
        ],
      },
      {
        id: "deductions",
        title: "Driver Deductions",
        icon: MinusCircle,
        path: "/admin/fleet/deductions",
        what: "Manage recurring or once-off deductions from driver earnings — e.g., vehicle rental fees, equipment fees, uniform costs.",
        features: [
          { label: "Add deduction", detail: "Specify the driver, amount, frequency (once-off / weekly / monthly), description, and start date." },
          { label: "Active deductions list", detail: "Shows all currently active deductions with next deduction date and remaining installments." },
          { label: "Deduction history", detail: "Full log of every deduction that has been applied, with the transaction reference." },
          { label: "Cancel deduction", detail: "Stop a recurring deduction at any time." },
        ],
      },
      {
        id: "taxi-associations",
        title: "Taxi Associations",
        icon: Building2,
        path: "/admin/taxi-associations",
        what: "Manages taxi associations — the formal bodies that group taxi drivers in South Africa. TNR pays associations a monthly fee based on the revenue generated by their member drivers.",
        features: [
          { label: "Association list", detail: "Left panel lists all registered associations with name, city, and number of linked drivers." },
          { label: "Create association", detail: "Click '+ New Association' and fill in: name, registration number, city, province, contact person, banking details, agreement type and amount, auto-payment settings, and notes." },
          { label: "Agreement types", detail: "Per Driver — a fixed rand amount multiplied by the number of active drivers. Fixed — a flat monthly fee regardless of driver count. Percentage — a percentage of TNR's total revenue earned from that association's drivers." },
          { label: "Overview tab", detail: "Shows banking details, agreement terms (with calculated monthly obligation), auto-payment schedule, and contact person." },
          { label: "Drivers tab", detail: "Lists all drivers linked to this association and their current status." },
          { label: "Revenue tab", detail: "12-month table showing rides, revenue, platform fees, subscription fees, and statement fees earned from this association's drivers each month — plus the calculated amount owed." },
          { label: "Payouts tab", detail: "History of all payments made to this association. Use Record Payout to log a manual bank payment. Use Pay Now to record an instant payment — it auto-fetches this month's revenue and pre-fills the amount based on the agreement." },
          { label: "Auto-Payment", detail: "Enable auto-pay and choose a day of the month (1–28). The system will automatically record the payout on that day each month. You can also set an override amount for months where the calculated amount should be overridden." },
          { label: "Edit association", detail: "Click the edit (pencil) icon on any association to update any detail." },
          { label: "Delete association", detail: "Click the trash icon — requires confirmation. Linked drivers will have their association cleared." },
          { label: "Run Auto-Payments button", detail: "Manually trigger the auto-payment processor to run now (normally runs on the scheduled day)." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "finance",
    label: "Finance",
    icon: DollarSign,
    color: "text-green",
    entries: [
      {
        id: "treasury",
        title: "Treasury",
        icon: Landmark,
        path: "/admin/treasury",
        what: "High-level view of TNR's financial position — total funds held in driver wallets, total funds in passenger wallets, total platform fees collected, and outstanding liabilities.",
        features: [
          { label: "Balance sheet summary", detail: "Passenger wallet pool, driver wallet pool, fee escrow, total liabilities vs. platform reserves." },
          { label: "Daily movement", detail: "Net inflows vs. outflows for today, week, and month." },
          { label: "CashUp pool", detail: "Total amount of CashOut/CashUp requests processed and pending." },
        ],
      },
      {
        id: "settlement",
        title: "Settlement Center",
        icon: Scale,
        path: "/admin/settlement",
        what: "Manages the settlement of funds — ensuring that money in TNR's system is properly accounted for and transferred to the correct parties.",
        features: [
          { label: "Pending settlements", detail: "Transactions awaiting final settlement to external banks." },
          { label: "Settle batch", detail: "Process a batch of settlements in one action." },
          { label: "Settlement history", detail: "All completed settlements with bank confirmation references." },
          { label: "Failed settlements", detail: "Any settlement that failed (e.g., wrong bank details). Review and reprocess." },
        ],
      },
      {
        id: "withdrawals",
        title: "Withdrawals & Payouts",
        icon: Wallet,
        path: "/admin/withdrawals",
        what: "Manages CashUp requests — when a driver or owner wants to withdraw earnings from their TNR wallet to their bank account.",
        features: [
          { label: "Pending queue", detail: "All withdrawal requests awaiting approval — user name, amount, bank details, requested date." },
          { label: "Approve", detail: "Mark as approved to initiate the bank transfer." },
          { label: "Reject", detail: "Reject with a reason. Funds return to the user's wallet." },
          { label: "History", detail: "All past withdrawals with status and bank reference." },
          { label: "Manual payout", detail: "Initiate a withdrawal on behalf of a user (admin override)." },
        ],
      },
      {
        id: "system-wallet",
        title: "System Wallet",
        icon: Landmark,
        path: "/admin/system-wallet",
        what: "The TNR platform's own wallet — holds collected platform fees, subscription fees, and statement fees. This is TNR's operating revenue pool.",
        features: [
          { label: "Current balance", detail: "Total funds currently held in the system wallet." },
          { label: "Inflow history", detail: "Every fee that was credited to the system wallet — platform fees, subscription fees, statement fees." },
          { label: "Outflow history", detail: "Funds moved out of the system wallet — payroll, association payments, operational expenses." },
          { label: "Transfer funds", detail: "Move funds from the system wallet to a specific account (requires superadmin approval)." },
        ],
      },
      {
        id: "revenue",
        title: "Revenue & P&L",
        icon: TrendingUp,
        path: "/admin/revenue",
        what: "The Profit & Loss dashboard. Shows gross revenue earned by TNR, all expenses (association payouts, employee salaries), and net profit. Configurable by time range.",
        features: [
          { label: "Range selector", detail: "Choose Last 7 days, Last 30 days, Last 90 days, or Last 12 months." },
          { label: "Hero strip", detail: "Four headline numbers: Gross Revenue, Total Expenses, Net Profit, Gross Volume (total money flowing through the platform)." },
          { label: "P&L Income Statement", detail: "INCOME section shows each revenue stream: Platform Fees, Subscription Fees, Statement Fees, then Total Revenue. EXPENSES section shows Association Payouts and Employee Salaries, then Total Expenses. NET PROFIT is highlighted at the bottom with the profit margin percentage." },
          { label: "Expand association breakdown", detail: "Click 'Association Payouts' row to expand and see how much was paid to each individual association in the period." },
          { label: "Right panel — Today", detail: "Today's revenue vs. yesterday's with a change indicator." },
          { label: "Right panel — Pending Obligations", detail: "Unpaid association payouts and unapproved salaries — amounts you still owe." },
          { label: "Right panel — All-Time Paid Out", detail: "Cumulative total of all payouts made since launch." },
          { label: "Right panel — System Wallet", detail: "Current system wallet balance with a link to the full System Wallet page." },
        ],
      },
      {
        id: "ledger",
        title: "Ledger",
        icon: BookOpen,
        path: "/admin/ledger",
        what: "Double-entry accounting ledger. Every transaction is broken down into its debit and credit entries. Used by accountants and auditors for formal financial review.",
        features: [
          { label: "Ledger entries", detail: "Chronological list of all entries — account, debit amount, credit amount, balance, reference." },
          { label: "Filter by account", detail: "Show only entries for a specific account (e.g., Platform Fees Payable, Driver Wallet Pool)." },
          { label: "Export", detail: "Download as CSV or Excel for importing into accounting software." },
        ],
      },
      {
        id: "reconciliation",
        title: "Reconciliation",
        icon: RefreshCw,
        path: "/admin/reconciliation",
        what: "Matches TNR's internal records against external bank statements to ensure no money is unaccounted for. Flags discrepancies.",
        features: [
          { label: "Upload bank statement", detail: "Upload a CSV bank statement to match against TNR records." },
          { label: "Matched entries", detail: "Transactions that match between TNR and the bank are shown in green." },
          { label: "Unmatched entries", detail: "Entries only in TNR or only in the bank — shown in red for investigation." },
          { label: "Mark reconciled", detail: "Once investigated and confirmed, mark a period as reconciled." },
        ],
      },
      {
        id: "refunds",
        title: "Refunds",
        icon: RotateCcw,
        path: "/admin/refunds",
        what: "Process full or partial refunds when a passenger was charged incorrectly or a trip was not completed.",
        features: [
          { label: "Refund request queue", detail: "Pending refund requests submitted by passengers through the app." },
          { label: "Approve refund", detail: "Funds are returned to the passenger's wallet from the driver's wallet (or from TNR's reserves if the driver has insufficient funds)." },
          { label: "Partial refund", detail: "Adjust the refund amount if only a partial amount should be returned." },
          { label: "Manual refund", detail: "Initiate a refund not submitted by the user — e.g., from a support call." },
          { label: "Refund history", detail: "All past refunds with original transaction, refund amount, approving admin, and date." },
        ],
      },
      {
        id: "chargebacks",
        title: "Chargebacks",
        icon: AlertOctagon,
        path: "/admin/chargebacks",
        what: "Manages card chargebacks — when a passenger's bank reverses a top-up payment. TNR must recover the funds from the passenger's wallet.",
        features: [
          { label: "Chargeback notifications", detail: "Incoming chargeback notifications from the payment gateway." },
          { label: "Freeze wallet", detail: "Immediately freeze the passenger's wallet to prevent spending recovered-chargeback funds." },
          { label: "Evidence submission", detail: "Prepare and submit evidence to dispute a chargeback with the card network." },
          { label: "Outcome tracking", detail: "Track whether TNR won or lost each chargeback case." },
        ],
      },
      {
        id: "wallet-ops",
        title: "Wallet Operations",
        icon: Banknote,
        path: "/admin/wallet-ops",
        what: "Admin-level wallet management — manually adjusting wallet balances, investigating wallet discrepancies, and overriding wallet states.",
        features: [
          { label: "Credit wallet", detail: "Add funds to a user's wallet (e.g., goodwill credit, failed top-up recovery)." },
          { label: "Debit wallet", detail: "Remove funds from a wallet (e.g., reverse a fraudulent credit)." },
          { label: "View wallet history", detail: "Full transaction history for any wallet with opening and closing balances." },
          { label: "Freeze/unfreeze wallet", detail: "Prevent all transactions on a wallet pending investigation." },
        ],
      },
      {
        id: "accounting",
        title: "Accounting",
        icon: Calculator,
        path: "/admin/accounting",
        what: "Summarised accounting reports — income statement, balance sheet snapshot, VAT summary, and tax-ready reports.",
        features: [
          { label: "Income statement", detail: "Monthly revenue and expense breakdown formatted for accounting." },
          { label: "VAT report", detail: "VAT collected on platform fees, ready for SARS submission." },
          { label: "Export to Excel", detail: "Download accounting reports in formats compatible with Pastel, Sage, or Xero." },
        ],
      },
      {
        id: "statements",
        title: "Statements",
        icon: FileText,
        path: "/admin/statements",
        what: "Generate and download formal statements for drivers, owners, and the platform itself.",
        features: [
          { label: "Driver statement", detail: "Monthly earnings statement for a specific driver — all payments received, fees deducted, net payout." },
          { label: "Owner statement", detail: "Monthly commission statement for a fleet owner." },
          { label: "Bulk generation", detail: "Generate statements for all drivers in one click (usually end of month)." },
          { label: "Email/WhatsApp delivery", detail: "Send generated statements directly to the driver's registered contact." },
        ],
      },
      {
        id: "subscriptions",
        title: "Subscriptions",
        icon: Tag,
        path: "/admin/subscriptions",
        what: "Manages driver subscription fees — the monthly fee drivers pay to use the TNR platform. Billing is automatic but this page lets you view, override, or waive fees.",
        features: [
          { label: "Subscription list", detail: "All active subscriptions — driver name, plan, monthly fee, next billing date, status." },
          { label: "Subscription history", detail: "Every billing event for each driver with payment status." },
          { label: "Waive fee", detail: "Skip a month's fee for a specific driver (e.g., they were on leave)." },
          { label: "Change plan", detail: "Move a driver to a different subscription tier." },
          { label: "Failed billing", detail: "Drivers whose subscription fee failed to process (insufficient wallet balance). Follow up here." },
        ],
      },
      {
        id: "fee-simulator",
        title: "Fee Simulator",
        icon: Calculator,
        path: "/admin/fee-simulator",
        what: "A calculator for testing what fees would be charged for a given transaction amount and driver type before committing to a fee config change.",
        features: [
          { label: "Enter amount", detail: "Type in a transaction amount and the simulator shows the exact fee breakdown — platform fee, net to driver, net to owner." },
          { label: "Scenario testing", detail: "Compare different fee structures side by side to evaluate the impact of a proposed change." },
        ],
      },
      {
        id: "fee-config",
        title: "Fee & Payout Config",
        icon: Settings,
        path: "/admin/fee-config",
        what: "The master configuration for all fees on the platform. Changes here affect every future transaction.",
        features: [
          { label: "Platform fee %", detail: "The percentage TNR takes from each passenger payment." },
          { label: "Subscription fee", detail: "Monthly fee charged to each driver." },
          { label: "Statement fee", detail: "Fee charged when a driver downloads their statement." },
          { label: "CashUp fee", detail: "Fee (if any) charged when a driver withdraws to their bank." },
          { label: "Change history", detail: "All past fee changes with the admin who made each change and the date — for audit compliance." },
        ],
      },
      {
        id: "pricing",
        title: "Pricing Rules",
        icon: DollarSign,
        path: "/admin/pricing",
        what: "Defines dynamic pricing rules — e.g., surge pricing during peak hours, discounts for high-volume drivers.",
        features: [
          { label: "Rule list", detail: "All active pricing rules with conditions and effects." },
          { label: "Add rule", detail: "Define a condition (time of day, location zone, driver tier) and the pricing modifier (% increase or decrease)." },
          { label: "Priority order", detail: "When multiple rules match a transaction, priority determines which rule applies." },
          { label: "Test rule", detail: "Simulate a transaction against the current rules to see the outcome before activating." },
        ],
      },
      {
        id: "export-center",
        title: "Export Center",
        icon: Download,
        path: "/admin/export-center",
        what: "One-stop shop for downloading data exports from the platform.",
        features: [
          { label: "Export types", detail: "Transactions, users, drivers, earnings, KYC records, audit logs, subscription data, association payouts." },
          { label: "Date range", detail: "Choose any custom date range for the export." },
          { label: "Format", detail: "CSV or Excel. Large exports are queued and a download link is emailed when ready." },
        ],
      },
      {
        id: "document-pricing",
        title: "Document Pricing",
        icon: Tag,
        path: "/admin/document-pricing",
        what: "Controls the fees charged for document-related services — e.g., the fee to download a formal earnings statement.",
        features: [
          { label: "Statement download fee", detail: "Set the rand amount charged to a driver each time they download their monthly earnings statement." },
          { label: "Per-document type pricing", detail: "Different document types can have different fees." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    color: "text-purple",
    entries: [
      {
        id: "analytics-overview",
        title: "Analytics Overview",
        icon: BarChart3,
        path: "/admin/analytics",
        what: "High-level charts and KPIs for the platform — new registrations, daily active users, payment volume, geographic spread.",
        features: [
          { label: "Registrations chart", detail: "Daily/weekly new driver and passenger registrations over time." },
          { label: "Payment volume chart", detail: "Total rand value transacted per day/week/month." },
          { label: "Active users", detail: "Number of unique users who made at least one transaction in the selected period." },
          { label: "Geographic heatmap", detail: "Where transactions are happening across South Africa." },
        ],
      },
      {
        id: "data-analytics",
        title: "Data Analytics",
        icon: Cpu,
        path: "/admin/data-analytics",
        what: "Deep-dive analytical tools — cohort analysis, retention curves, funnel analysis, and custom metric queries.",
        features: [
          { label: "Cohort analysis", detail: "Track how a group of users registered in the same week/month behave over time." },
          { label: "Retention", detail: "What percentage of new users are still transacting 30/60/90 days later." },
          { label: "Funnel", detail: "Registration → KYC → First Payment — see where users drop off." },
        ],
      },
      {
        id: "growth",
        title: "Growth",
        icon: Rocket,
        path: "/admin/growth",
        what: "Growth-specific metrics — month-over-month growth rate, new market penetration, referral conversion.",
        features: [
          { label: "MoM growth", detail: "Month-over-month growth in drivers, passengers, and payment volume." },
          { label: "Referral stats", detail: "How many users came via referral codes vs. organic." },
          { label: "Target tracking", detail: "Progress against set growth targets for the current month/quarter." },
        ],
      },
      {
        id: "routes",
        title: "Routes & Trips",
        icon: MapPin,
        path: "/admin/routes",
        what: "Analyses where trips are happening — popular routes, busiest times, most active zones.",
        features: [
          { label: "Route map", detail: "Visual map of the most common origin-destination pairs." },
          { label: "Peak hours", detail: "Hourly breakdown of transaction volume to identify peak times." },
          { label: "Zone analysis", detail: "Which taxi ranks or zones generate the most revenue." },
        ],
      },
      {
        id: "intelligence",
        title: "Intelligence (Superadmin)",
        icon: Brain,
        path: "/admin/intelligence",
        what: "AI-assisted intelligence tools — anomaly detection, predictive analytics, fraud pattern recognition. Visible to superadmin only.",
        features: [
          { label: "Anomaly alerts", detail: "ML model flags unusual transaction patterns or behaviour that differs significantly from a user's norm." },
          { label: "Fraud scoring", detail: "Each transaction receives a risk score. High-scoring transactions are flagged for review." },
          { label: "Predictive revenue", detail: "Forecast next month's revenue based on current trends." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "saferide",
    label: "SafeRide",
    icon: Shield,
    color: "text-red-400",
    entries: [
      {
        id: "saferide-overview",
        title: "What is SafeRide?",
        icon: Shield,
        what: "SafeRide is TNR's passenger and driver safety system. It allows users to share their live trip location with contacts, trigger an SOS alert, and use a 'Dead Man Code' — a decoy PIN that silently triggers an emergency alert when entered under duress.",
        features: [
          { label: "How SafeRide works", detail: "When a driver starts a SafeRide trip, their location is tracked in real time. If they trigger an SOS, the admin Command Centre receives an alert with the live location. If a passenger enters the Dead Man Code instead of their real PIN to cancel an SOS, the system appears to cancel but continues tracking silently and alerts the TNR safety team." },
          { label: "Dead Man Code", detail: "A secret 4–6 digit code set by the user (different from their real PIN). If they enter this code when prompted to 'cancel' an SOS — which a hijacker might force them to do — the SOS stays active invisibly and the team is alerted." },
        ],
      },
      {
        id: "saferide-command",
        title: "SafeRide Command Centre",
        icon: Shield,
        path: "/admin/saferide",
        what: "The primary dashboard for monitoring active safety situations. Real-time view of all active SOS alerts and SafeRide trips.",
        features: [
          { label: "Active SOS list", detail: "All currently active SOS alerts — user name, last known location, time triggered, type (passenger/driver)." },
          { label: "Locate on map", detail: "Click an SOS to see the live location on a map." },
          { label: "Resolve SOS", detail: "Mark an SOS as resolved once the situation is confirmed safe." },
          { label: "Contact user", detail: "Call or WhatsApp the user directly from the Command Centre." },
          { label: "Escalate", detail: "Escalate to law enforcement with the user's last known location pre-filled." },
        ],
      },
      {
        id: "live-monitor",
        title: "Live Monitor",
        icon: Activity,
        path: "/admin/monitoring",
        what: "Real-time feed of all platform activity — new payments, new registrations, SOS triggers, system events.",
        features: [
          { label: "Live event stream", detail: "A scrolling feed of events happening right now across the platform." },
          { label: "Filter by event type", detail: "Show only transactions, only SOS events, only registrations." },
          { label: "Sound alerts", detail: "Enable audio alerts for SOS triggers so the monitor operator doesn't need to watch the screen continuously." },
        ],
      },
      {
        id: "live-trips",
        title: "Live Trips",
        icon: Activity,
        path: "/admin/trips",
        what: "View all SafeRide trips currently active — driver, passenger, route, duration.",
        features: [
          { label: "Active trip list", detail: "Each row shows driver name, passenger name (if linked), trip start time, and duration." },
          { label: "Track trip", detail: "Click any trip to see the live location on a map." },
          { label: "End trip", detail: "Admin can forcibly end a trip if it appears stuck or the driver has stopped responding." },
        ],
      },
      {
        id: "incidents",
        title: "Incidents",
        icon: AlertTriangle,
        path: "/admin/saferide/incidents",
        what: "Log and manage safety incidents — SOS events, reported crimes, accidents.",
        features: [
          { label: "Incident list", detail: "All incidents with severity, status, and date." },
          { label: "Incident detail", detail: "Full timeline of an incident — when SOS triggered, location at each point, admin actions taken, resolution notes." },
          { label: "Create incident", detail: "Log an incident reported via phone or WhatsApp that did not come through the app." },
          { label: "Link to transaction", detail: "Attach the incident to the specific trip transaction it relates to." },
          { label: "Resolution notes", detail: "Document the outcome — police case number, injury report, etc." },
        ],
      },
      {
        id: "dead-man-resets",
        title: "Dead Man Resets",
        icon: FolderLock,
        path: "/admin/saferide/dead-man-resets",
        what: "When a user has forgotten their Dead Man Code, they submit a reset request. Admins review and approve or reject it here.",
        features: [
          { label: "Pending requests", detail: "All outstanding reset requests — user name, reason given, submission date." },
          { label: "Approve reset", detail: "Clear the user's dead man code so they can set a new one. This action is logged in the audit trail and reported to senior management." },
          { label: "Reject reset", detail: "Reject with a reason — e.g., insufficient justification." },
          { label: "Why this is sensitive", detail: "The dead man code is a safety feature. Approving a reset for someone who is actually under duress would compromise their safety. Every approval requires careful verification of identity." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    color: "text-yellow",
    entries: [
      {
        id: "regulatory",
        title: "Regulatory & FICA",
        icon: ClipboardList,
        path: "/admin/regulatory",
        what: "FICA (Financial Intelligence Centre Act) compliance tools. South African law requires TNR to verify customer identities, keep records, and report suspicious activity.",
        features: [
          { label: "FICA status", detail: "Percentage of users who are FICA-compliant (KYC approved with ID number verified)." },
          { label: "Non-compliant users", detail: "List of users who have exceeded the transaction threshold without completing FICA. Their wallets may be limited until compliant." },
          { label: "STR filing", detail: "Suspicious Transaction Reports — file a report to the FIC when a transaction is flagged as potentially illegal." },
          { label: "Record keeping", detail: "Confirms that all required records are being stored for the legally required period (5 years)." },
        ],
      },
      {
        id: "compliance-risk",
        title: "Compliance & Risk",
        icon: AlertTriangle,
        path: "/admin/compliance",
        what: "Operational compliance monitoring — ensuring TNR's processes meet legal and regulatory requirements.",
        features: [
          { label: "Compliance checklist", detail: "A live checklist of required compliance tasks — KYC backlog, FICA reporting, audit log health." },
          { label: "Risk register", detail: "Documented risks with their likelihood, impact, and mitigation status." },
          { label: "Policy documents", detail: "Links to TNR's internal compliance policies." },
        ],
      },
      {
        id: "risk",
        title: "Risk & Fraud",
        icon: ShieldAlert,
        path: "/admin/risk",
        what: "Tools for detecting and managing fraud — flagged transactions, blocked accounts, fraud patterns.",
        features: [
          { label: "Flagged transactions", detail: "Transactions that tripped fraud detection rules — unusually large amounts, velocity spikes, known fraudulent patterns." },
          { label: "Investigate", detail: "Click a flagged transaction to see the full context and decide to clear it or escalate." },
          { label: "Block account", detail: "Immediately block all transactions from a user account." },
          { label: "Fraud rules", detail: "The active set of rules that trigger fraud flags. View and adjust thresholds." },
        ],
      },
      {
        id: "disputes",
        title: "Disputes",
        icon: Scale,
        path: "/admin/disputes",
        what: "Manages payment disputes between passengers and drivers. A passenger can dispute a charge if they believe they were overcharged or if a trip was not completed.",
        features: [
          { label: "Dispute queue", detail: "All open disputes with submitter, disputed amount, status, and age." },
          { label: "Review evidence", detail: "See the original transaction, the passenger's reason, and any evidence submitted." },
          { label: "Rule in favour of passenger", detail: "Refund the disputed amount to the passenger." },
          { label: "Rule in favour of driver", detail: "Dismiss the dispute. The driver keeps the payment." },
          { label: "Request more info", detail: "Ask the passenger or driver for more information before ruling." },
        ],
      },
      {
        id: "limits",
        title: "Tx Limits",
        icon: Gauge,
        path: "/admin/limits",
        what: "Transaction limits define the maximum amounts users can send or receive. FICA requires these limits for non-compliant users.",
        features: [
          { label: "Per-transaction limit", detail: "Maximum amount for a single payment." },
          { label: "Daily limit", detail: "Maximum total a user can send/receive in 24 hours." },
          { label: "Monthly limit", detail: "Maximum total in a calendar month." },
          { label: "KYC exemption", detail: "Once a user completes KYC, their limits are upgraded." },
          { label: "Override", detail: "Apply a custom limit to a specific user account." },
        ],
      },
      {
        id: "velocity",
        title: "Velocity Monitor",
        icon: Zap,
        path: "/admin/velocity",
        what: "Monitors transaction velocity — how quickly users are transacting. Sudden spikes in frequency can indicate fraud or a compromised account.",
        features: [
          { label: "Velocity alerts", detail: "Users who have exceeded their normal transaction frequency in a short period." },
          { label: "Velocity rules", detail: "Define what constitutes an alert — e.g., more than 10 transactions in 1 hour." },
          { label: "Temporary hold", detail: "Automatically place a temporary hold on accounts that breach velocity limits until reviewed." },
        ],
      },
      {
        id: "gdpr",
        title: "GDPR & Privacy",
        icon: ShieldCheck,
        path: "/admin/gdpr",
        what: "Data privacy tools — managing user data access requests, deletion requests, and consent records.",
        features: [
          { label: "Data access requests", detail: "A user can request all data TNR holds on them. This page tracks those requests and the due date (30 days)." },
          { label: "Deletion requests", detail: "When a user requests account deletion, their personal data must be anonymised. Track and process here." },
          { label: "Consent records", detail: "Evidence that users accepted TNR's terms and privacy policy at registration." },
          { label: "Data export", detail: "Generate and deliver a user's full data export as required by POPIA (SA equivalent of GDPR)." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "comms",
    label: "Communications",
    icon: Megaphone,
    color: "text-orange-400",
    entries: [
      {
        id: "announcements",
        title: "Announcements",
        icon: Megaphone,
        path: "/admin/notifications",
        what: "Send push notifications to all users or targeted groups — new features, service updates, emergency notices.",
        features: [
          { label: "Target audience", detail: "All users, drivers only, passengers only, or a specific city/province." },
          { label: "Push notification", detail: "Sends a notification to users' phones that appears even when the app is closed." },
          { label: "In-app message", detail: "Appears in the user's Inbox inside the app." },
          { label: "Schedule", detail: "Schedule an announcement to go out at a specific date and time." },
        ],
      },
      {
        id: "whatsapp",
        title: "WhatsApp",
        icon: MessageCircle,
        path: "/admin/whatsapp",
        what: "Send WhatsApp messages to users via the TNR WhatsApp Business account.",
        features: [
          { label: "Broadcast", detail: "Send a WhatsApp message to a list of users." },
          { label: "Template messages", detail: "WhatsApp requires pre-approved templates for outbound messages. Manage approved templates here." },
          { label: "Message history", detail: "Log of all WhatsApp messages sent from the platform." },
        ],
      },
      {
        id: "send-notice",
        title: "Send Notice",
        icon: Mail,
        path: "/admin/notices",
        what: "Send a targeted in-app notice to a specific user — e.g., inform a driver their document is expiring.",
        features: [
          { label: "Target user", detail: "Search for and select the specific user to notify." },
          { label: "Notice type", detail: "Document expiry, account warning, payment issue, general information." },
          { label: "Custom message", detail: "Write a custom message body to appear in the user's Inbox." },
          { label: "Delivery confirmation", detail: "See when the notice was delivered and read." },
        ],
      },
      {
        id: "promotions",
        title: "Promotions",
        icon: Tag,
        path: "/admin/promotions",
        what: "Create and manage promotional campaigns — discounted fees, cashback offers, welcome bonuses.",
        features: [
          { label: "Create promotion", detail: "Set a promotion code, discount type (% or rand off), maximum uses, expiry date, and target user type." },
          { label: "Active promotions", detail: "All currently running promotions with usage count vs. limit." },
          { label: "Promotion analytics", detail: "How many users used a specific promotion and the total discount value given." },
        ],
      },
      {
        id: "marketing",
        title: "Marketing",
        icon: Target,
        path: "/admin/marketing",
        what: "Marketing campaign management — track the effectiveness of campaigns across channels.",
        features: [
          { label: "Campaign list", detail: "All marketing campaigns with channel, spend, registrations attributed, and revenue generated." },
          { label: "UTM tracking", detail: "Track referral sources via UTM parameters in app store links or WhatsApp campaigns." },
          { label: "ROI calculator", detail: "Campaign spend vs. revenue generated." },
        ],
      },
      {
        id: "referrals",
        title: "Referrals",
        icon: Users2,
        path: "/admin/referrals",
        what: "The referral programme lets existing users earn rewards for referring new users. This page manages that programme.",
        features: [
          { label: "Referral list", detail: "Who referred whom, when, and whether the reward has been paid." },
          { label: "Reward config", detail: "Set the referral reward amount (e.g., R10 wallet credit for the referrer)." },
          { label: "Pending rewards", detail: "Rewards that have been earned but not yet credited — approve or batch-approve." },
        ],
      },
      {
        id: "feedback",
        title: "User Feedback",
        icon: Star,
        path: "/admin/feedback",
        what: "App store reviews, in-app star ratings, and written feedback submitted by users.",
        features: [
          { label: "Rating summary", detail: "Average app rating and distribution of 1–5 star reviews." },
          { label: "Written feedback", detail: "Full text of feedback submitted through the app." },
          { label: "Filter by rating", detail: "Focus on low ratings to identify issues." },
          { label: "Mark for action", detail: "Tag feedback items that require follow-up (e.g., a bug report in a review)." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "support",
    label: "Support",
    icon: HelpCircle,
    color: "text-cyan",
    entries: [
      {
        id: "support-lookup",
        title: "Support Lookup",
        icon: HelpCircle,
        path: "/admin/support",
        what: "The primary tool for handling incoming support calls or WhatsApp messages. Quickly look up a user and take action on their behalf.",
        features: [
          { label: "Search by phone/name", detail: "Find the user's account within seconds." },
          { label: "View wallet balance", detail: "See the user's current balance immediately." },
          { label: "Reset PIN", detail: "Generate a temporary PIN for a user who has forgotten theirs. Sends via WhatsApp/SMS." },
          { label: "View recent transactions", detail: "The last 10 transactions — useful to diagnose 'I paid but the driver didn't receive it' calls." },
          { label: "Suspend account", detail: "Temporarily suspend if the call reveals account compromise." },
          { label: "Add credit", detail: "Add a goodwill wallet credit with an internal note." },
        ],
      },
      {
        id: "whatsapp-support",
        title: "WhatsApp Support",
        icon: MessageCircle,
        path: "/admin/whatsapp-support",
        what: "A dedicated view for the support team handling incoming WhatsApp messages from users.",
        features: [
          { label: "Message queue", detail: "Incoming support messages in chronological order with user name (if identified)." },
          { label: "Link to account", detail: "Link a WhatsApp message to a TNR user account by phone number." },
          { label: "Quick replies", detail: "Saved response templates for common questions (PIN reset, CashUp timing, etc.)." },
          { label: "Resolve / Escalate", detail: "Mark a conversation resolved or escalate to a senior agent." },
        ],
      },
      {
        id: "tickets",
        title: "Support Tickets",
        icon: ClipboardList,
        path: "/admin/tickets",
        what: "Formal ticket system for complex support issues that require investigation and tracking over time.",
        features: [
          { label: "Create ticket", detail: "Open a ticket for any issue reported by a user — auto-linked to their account." },
          { label: "Priority levels", detail: "Low, Medium, High, Critical. Critical tickets escalate to a senior admin immediately." },
          { label: "Assignment", detail: "Assign a ticket to a specific support agent." },
          { label: "Internal notes", detail: "Support agents can leave internal notes visible only to admin — not to the user." },
          { label: "SLA tracking", detail: "Time to first response and time to resolution are tracked against SLA targets." },
          { label: "Resolve", detail: "Mark a ticket resolved and optionally send a closing message to the user." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "system",
    label: "System",
    icon: Settings,
    color: "text-textMuted",
    entries: [
      {
        id: "daily-ops",
        title: "Daily Operations",
        icon: Zap,
        path: "/admin/daily-ops",
        what: "A checklist and dashboard for the daily operational tasks that must be completed — settlement runs, statement generation, subscription billing checks.",
        features: [
          { label: "Daily task list", detail: "Auto-populated list of tasks for today — e.g., 'Run settlement', 'Process 3 pending CashUps', 'Review 2 new KYC submissions'." },
          { label: "Mark complete", detail: "Check off each task as it is done. The log is saved for accountability." },
          { label: "Automated task status", detail: "Shows whether automated background jobs (subscription billing loop, maintenance fee loop, auto-pay loop) ran successfully overnight." },
        ],
      },
      {
        id: "geography",
        title: "Coverage Zones",
        icon: Globe,
        path: "/admin/geography",
        what: "Define the geographic zones where TNR operates. Trips outside a coverage zone may be restricted or flagged.",
        features: [
          { label: "Zone map", detail: "Visual map of all coverage zones with boundaries." },
          { label: "Add zone", detail: "Draw a polygon on the map to define a new coverage area." },
          { label: "Zone rules", detail: "Optionally apply different fee structures or restrictions to different zones." },
        ],
      },
      {
        id: "health",
        title: "System Health",
        icon: Activity,
        path: "/admin/health",
        what: "Real-time technical health of the TNR backend — API response times, database performance, background job status, error rates.",
        features: [
          { label: "API latency", detail: "Current average response time for key API endpoints." },
          { label: "Error rate", detail: "Percentage of API calls returning errors in the last 5 minutes." },
          { label: "Background jobs", detail: "Status of all background billing loops and auto-payment jobs — last run time and next scheduled run." },
          { label: "Database", detail: "Active connections, query times, pool usage." },
          { label: "Uptime", detail: "Platform uptime for the last 7/30/90 days." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "hr",
    label: "Human Resources",
    icon: Users2,
    color: "text-yellow",
    entries: [
      {
        id: "hr-staff",
        title: "HR · Staff",
        icon: Users2,
        path: "/admin/hr",
        what: "Manages TNR's internal employees — admin staff, support agents, operations personnel.",
        features: [
          { label: "Employee list", detail: "All staff with name, role, department, salary, start date, and status." },
          { label: "Add employee", detail: "Create a new employee record with personal details, position, and salary." },
          { label: "Edit employee", detail: "Update salary, role, department, or contact details." },
          { label: "Deactivate", detail: "Mark an employee as inactive when they leave. This stops salary processing for them." },
          { label: "Link to admin account", detail: "Optionally link an employee record to their admin panel login account." },
        ],
      },
      {
        id: "payroll",
        title: "Payroll",
        icon: Banknote,
        path: "/admin/payroll",
        what: "Monthly salary processing for TNR staff. Run payroll, approve salary payments, and maintain payslip records.",
        features: [
          { label: "Payroll run", detail: "Generates salary entries for all active employees for the selected month." },
          { label: "Review & approve", detail: "Review the full payroll batch before approving. Each line shows gross salary, deductions, and net pay." },
          { label: "Mark as paid", detail: "Once bank transfers are done, mark the payroll as paid. This updates the P&L expenses." },
          { label: "Payslip generation", detail: "Generates a formal payslip PDF for each employee." },
          { label: "Historical payroll", detail: "Browse past months' payroll runs." },
        ],
      },
      {
        id: "documents",
        title: "HR Documents / Company Documents",
        icon: FolderLock,
        path: "/admin/documents",
        what: "Secure document vault for company and HR documents — employment contracts, NDAs, compliance certificates, policies.",
        features: [
          { label: "Upload document", detail: "Upload any file with a category tag and description." },
          { label: "Document list", detail: "All stored documents with upload date, category, and who uploaded them." },
          { label: "Access control", detail: "Documents are visible only to users with the appropriate permission level." },
          { label: "Download", detail: "Authorised users can download any stored document." },
          { label: "Expiry tracking", detail: "Documents with expiry dates (e.g., business licence) are flagged before they expire." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "superadmin",
    label: "Superadmin",
    icon: ShieldCheck,
    color: "text-purple",
    entries: [
      {
        id: "admin-accounts",
        title: "Admin Accounts",
        icon: Shield,
        path: "/admin/admins",
        what: "Create and manage admin panel user accounts. Only superadmins can access this page.",
        features: [
          { label: "Admin list", detail: "All admin accounts with name, email, role, and last login." },
          { label: "Create admin", detail: "Add a new admin account — name, email, role, and initial password." },
          { label: "Edit role", detail: "Change an admin's role. Changes take effect on their next login." },
          { label: "Deactivate", detail: "Disable an admin account without deleting it (preserves the audit trail)." },
          { label: "Reset admin password", detail: "Generate a new temporary password for a locked-out admin." },
        ],
      },
      {
        id: "settings",
        title: "Settings & Config",
        icon: Settings,
        path: "/admin/settings",
        what: "Platform-wide settings — app name, contact details, feature flags, notification templates.",
        features: [
          { label: "Platform settings", detail: "App name, support phone number, support email, WhatsApp number, terms & policy URLs." },
          { label: "Feature flags", detail: "Toggle individual features on/off platform-wide without a code deployment." },
          { label: "Maintenance mode", detail: "Enable maintenance mode to block all transactions while updates are in progress." },
        ],
      },
      {
        id: "console",
        title: "System Console",
        icon: Terminal,
        path: "/admin/console",
        what: "A terminal-like interface for running administrative commands on the backend server. Extremely powerful — use with caution.",
        features: [
          { label: "Run commands", detail: "Execute backend maintenance commands — e.g., re-run a failed billing cycle, clear a cache, trigger a specific background job." },
          { label: "Command log", detail: "Every command run is logged with the admin who ran it and the output." },
          { label: "Pre-set commands", detail: "Common safe commands are available as one-click buttons to reduce the risk of typos." },
        ],
      },
      {
        id: "database",
        title: "Database",
        icon: Database,
        path: "/admin/database",
        what: "Direct database inspection tools. Read-only by default — allows superadmins to query the database for data not exposed through the normal UI.",
        features: [
          { label: "Table browser", detail: "Browse database tables and view records." },
          { label: "Run query", detail: "Execute a read-only SQL query. Write operations require a second superadmin to approve." },
          { label: "Schema viewer", detail: "View the current database schema — tables, columns, and relationships." },
        ],
      },
      {
        id: "superadmin-tools",
        title: "Superadmin Tools",
        icon: ShieldCheck,
        path: "/admin/superadmin",
        what: "Miscellaneous superadmin tools — bulk operations, data migrations, system resets.",
        features: [
          { label: "Bulk actions", detail: "Apply an action to many users at once — e.g., apply a subscription fee to all new drivers registered last month." },
          { label: "Data migration tools", detail: "Move or transform data when platform requirements change." },
          { label: "Clear cache", detail: "Clear server-side caches if data is appearing stale." },
        ],
      },
      {
        id: "test-users",
        title: "Test Users",
        icon: Monitor,
        path: "/admin/test-users",
        what: "Manage test accounts used for QA and development testing. Test accounts can transact in the live environment with fake money.",
        features: [
          { label: "Test account list", detail: "All accounts flagged as test users." },
          { label: "Add test account", detail: "Register a new test user without going through the real onboarding flow." },
          { label: "Reset test wallet", detail: "Set a test wallet balance to a specific amount for testing a scenario." },
          { label: "Clear test data", detail: "Delete all transactions made by test accounts to keep analytics clean." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "driver-app",
    label: "Driver App Guide",
    icon: Car,
    color: "text-cyan",
    entries: [
      {
        id: "driver-app-overview",
        title: "Driver App — How It Works",
        icon: Car,
        what: "The driver app is a React Native mobile application (iOS and Android) called Tag n Ride. Drivers install it, register, and use it to receive passenger payments.",
        features: [
          { label: "Registration", detail: "Driver downloads the app, selects 'Driver' role, enters their name, surname, phone number, vehicle plate, and creates a 4-digit PIN." },
          { label: "Login", detail: "Phone number + 4-digit PIN." },
          { label: "QR Code (My QR tab)", detail: "The driver's unique payment QR code. They display this to passengers who scan it to pay. The QR encodes the driver's unique TNR code." },
          { label: "Wallet (Home tab)", detail: "Shows current wallet balance, recent transactions, and a CashUp (withdraw) button." },
          { label: "Receiving a payment", detail: "Passenger scans the QR code, enters the amount, enters their PIN, and confirms. The driver sees the payment arrive in real time with a notification." },
          { label: "CashUp (withdraw)", detail: "Driver taps CashUp, selects their payout account (bank details saved in Profile), enters the amount, and confirms with their PIN. Funds are transferred to their bank account." },
          { label: "Profile tab", detail: "KYC verification, vehicle plate, taxi association selection, payout bank accounts, change PIN, SafeRide safety settings, support contact." },
        ],
      },
      {
        id: "driver-profile-app",
        title: "Driver Profile Screen",
        icon: Car,
        what: "The profile screen in the driver app gives drivers full control over their account settings.",
        features: [
          { label: "KYC Verification", detail: "Tap to submit ID document and selfie for verification. Required before the driver can receive payments." },
          { label: "Vehicle Plate", detail: "Tap the pencil icon to edit the vehicle registration plate. Tap Save to confirm." },
          { label: "Taxi Association", detail: "Under TAXI ASSOCIATION — tap to select which taxi association the driver belongs to. A bottom sheet opens with a list of all registered associations. Tap one to select and save instantly. Tap 'None / Independent' to remove the link." },
          { label: "Payout Accounts", detail: "Two bank accounts can be saved — My Account (personal bank) and Owner Account (the taxi owner's bank, for when the owner receives payment directly). Tap either row to add or update bank details." },
          { label: "FLEET — Switch Owner", detail: "Tap to initiate a transfer to a new fleet owner. This creates a transfer request that the admin must approve." },
          { label: "SafeRide Profile", detail: "Set up emergency contacts and safety information. A yellow dot appears on this row until completed." },
          { label: "Dead Man Code", detail: "Set a secret emergency code. See SafeRide section of this manual for full explanation." },
          { label: "Change PIN", detail: "Enter current PIN, new PIN, and confirm new PIN. PIN must be 4 digits." },
          { label: "Sign Out", detail: "Logs out of the app. The driver must re-enter their phone and PIN to log back in." },
        ],
      },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  {
    id: "passenger-app",
    label: "Passenger App Guide",
    icon: Users2,
    color: "text-purple",
    entries: [
      {
        id: "passenger-app-overview",
        title: "Passenger App — How It Works",
        icon: Users2,
        what: "Passengers use the same Tag n Ride app but with the 'Passenger' role. The experience is focused on topping up and paying drivers.",
        features: [
          { label: "Registration", detail: "Select 'Passenger', enter name, surname, phone number, and create a 4-digit PIN." },
          { label: "Top Up wallet", detail: "Tap Top Up on the home screen. Enter an amount. Pay via card (Paystack) or EFT. Funds appear in the wallet within seconds (card) or within a business day (EFT)." },
          { label: "Pay a driver", detail: "Scan the driver's QR code OR tap the Pay button and enter the driver's TNR code manually. Enter the trip fare amount. Confirm with your 4-digit PIN. Done — payment is instant." },
          { label: "Transaction history", detail: "All payments and top-ups with date, amount, and driver name." },
          { label: "Share Live Location (SafeRide)", detail: "If in an active SafeRide trip, a 'Share Live Location' button appears in the profile. Tap to generate a tracking link to send to a contact via any messenger." },
          { label: "Statement", detail: "Download a PDF statement of all transactions for a selected month." },
        ],
      },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow/30 text-text rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function EntryCard({ entry, q }: { entry: ManualEntry; q: string }) {
  const [open, setOpen] = useState(false);
  const Icon = entry.icon;
  const matches = q
    ? entry.title.toLowerCase().includes(q.toLowerCase()) ||
      entry.what.toLowerCase().includes(q.toLowerCase()) ||
      entry.features.some(f => f.label.toLowerCase().includes(q.toLowerCase()) || f.detail.toLowerCase().includes(q.toLowerCase()))
    : true;
  if (!matches) return null;
  return (
    <div className="border border-border rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-bg3 transition-colors">
        <div className="w-9 h-9 rounded-lg bg-cyanDim flex items-center justify-center flex-shrink-0 mt-0.5">
          <Icon size={16} className="text-cyan" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-text font-bold text-sm">{highlight(entry.title, q)}</h3>
            {entry.path && (
              <span className="font-mono text-[10px] text-textDim bg-bg3 px-2 py-0.5 rounded border border-border">
                {entry.path}
              </span>
            )}
          </div>
          <p className="text-textMuted text-xs mt-1 line-clamp-2">{entry.what}</p>
        </div>
        <div className="flex-shrink-0 mt-1">
          {open ? <ChevronDown size={15} className="text-textDim" /> : <ChevronRight size={15} className="text-textDim" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-border bg-bg/40 p-4 space-y-4">
          <p className="text-textMuted text-sm leading-relaxed">{entry.what}</p>
          <div className="space-y-3">
            {entry.features.map((f, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan mt-2 flex-shrink-0" />
                <div>
                  <span className="text-text text-sm font-semibold">{highlight(f.label, q)}</span>
                  <span className="text-textMuted text-sm"> — {highlight(f.detail, q)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionBlock({ section, q, activeId }: { section: ManualSection; q: string; activeId: string }) {
  const Icon = section.icon;
  const hasMatch = q
    ? section.entries.some(e =>
        e.title.toLowerCase().includes(q.toLowerCase()) ||
        e.what.toLowerCase().includes(q.toLowerCase()) ||
        e.features.some(f => f.label.toLowerCase().includes(q.toLowerCase()) || f.detail.toLowerCase().includes(q.toLowerCase()))
      )
    : true;
  if (!hasMatch) return null;
  return (
    <div id={`section-${section.id}`} className="mb-10 scroll-mt-24">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-bg2 border border-border flex items-center justify-center">
          <Icon size={18} className={section.color} />
        </div>
        <h2 className="text-text font-extrabold text-lg">{section.label}</h2>
      </div>
      {section.entries.map(e => (
        <EntryCard key={e.id} entry={e} q={q} />
      ))}
    </div>
  );
}

export default function ManualPage() {
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState("overview");

  const totalEntries = SECTIONS.reduce((s, sec) => s + sec.entries.length, 0);

  return (
    <AdminShell title="System Manual">
      <div className="max-w-6xl">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-cyanDim border border-cyan/30 flex items-center justify-center flex-shrink-0">
              <BookOpen size={22} className="text-cyan" />
            </div>
            <div>
              <h1 className="text-text font-extrabold text-2xl">Tag n Ride — System Manual</h1>
              <p className="text-textMuted text-sm mt-1">
                Complete reference guide for every page, button, and feature of the TNR platform.
                {" "}<span className="text-cyan font-semibold">{SECTIONS.length} sections · {totalEntries} pages documented</span>
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-xl">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textDim" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search the manual… (e.g. 'refund', 'KYC', 'association', 'PIN reset')"
              className="w-full bg-bg2 border border-border rounded-xl pl-10 pr-4 py-3 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textDim hover:text-text">
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-8">

          {/* TOC sidebar */}
          <aside className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-6 space-y-0.5">
              <p className="text-[10px] font-extrabold text-textDim uppercase tracking-widest mb-3">Contents</p>
              {SECTIONS.map(sec => {
                const Icon = sec.icon;
                return (
                  <a
                    key={sec.id}
                    href={`#section-${sec.id}`}
                    onClick={() => setActiveId(sec.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeId === sec.id
                        ? "bg-cyanDim text-cyan"
                        : "text-textMuted hover:text-text hover:bg-bg3"
                    }`}>
                    <Icon size={12} />
                    <span className="truncate">{sec.label}</span>
                  </a>
                );
              })}
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {q && (
              <p className="text-textMuted text-xs mb-6">
                Showing results for <span className="text-cyan font-semibold">"{q}"</span>
              </p>
            )}
            {SECTIONS.map(sec => (
              <SectionBlock key={sec.id} section={sec} q={q} activeId={activeId} />
            ))}
            {q && SECTIONS.every(sec =>
              !sec.entries.some(e =>
                e.title.toLowerCase().includes(q.toLowerCase()) ||
                e.what.toLowerCase().includes(q.toLowerCase()) ||
                e.features.some(f =>
                  f.label.toLowerCase().includes(q.toLowerCase()) ||
                  f.detail.toLowerCase().includes(q.toLowerCase())
                )
              )
            ) && (
              <div className="text-center py-16">
                <p className="text-textMuted text-sm">No results for <span className="text-text font-semibold">"{q}"</span></p>
                <button onClick={() => setQ("")} className="mt-3 text-cyan text-sm hover:underline">Clear search</button>
              </div>
            )}
          </main>
        </div>
      </div>
    </AdminShell>
  );
}
