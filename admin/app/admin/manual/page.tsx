"use client";
import { useState, useEffect, useRef } from "react";
import { AdminShell } from "@/components/layout/AdminShell";
import {
  Search, BookOpen, ChevronDown, ChevronRight, ChevronUp,
  AlertTriangle, Info, Lightbulb, CheckCircle, XCircle,
  Smartphone, Car, Users, Users2, Truck, Shield, ShieldCheck,
  Wallet, CreditCard, QrCode, ArrowLeftRight, TrendingUp,
  BarChart3, Settings, Bell, FileText, Fingerprint, Building2,
  Banknote, Calculator, Scale, RefreshCw, RotateCcw, Download,
  MapPin, Activity, Terminal, Database, Zap, Star,
  Phone, Lock, Eye, UserCheck, Percent, MinusCircle,
  MessageCircle, Mail, Tag, Target, Globe, Cpu, Brain,
  Landmark, BookMarked, Hash, List, AlertOctagon, PieChart,
  Repeat2, FileWarning, FolderLock, ClipboardList, ShieldAlert,
  Gauge, Megaphone, HelpCircle, DollarSign, Rocket, Monitor,
  PrinterIcon, ArrowRight, Circle, Dot,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// DATA MODEL
// ─────────────────────────────────────────────────────────────────────────────

type CalloutType = "info" | "tip" | "warning" | "important" | "success";

type Block =
  | { type: "para"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "bullets"; items: string[] }
  | { type: "callout"; kind: CalloutType; title?: string; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "divider" };

type Section = {
  id: string;
  title: string;
  icon?: any;
  path?: string;
  blocks: Block[];
};

type Chapter = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  sections: Section[];
};

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL CONTENT
// ─────────────────────────────────────────────────────────────────────────────

const CHAPTERS: Chapter[] = [

  // ════════════════════════════════════════════════════════════
  {
    id: "intro",
    number: "01",
    title: "Introduction to Tag n Ride",
    subtitle: "What the platform is, who it serves, and why it exists",
    icon: BookOpen,
    color: "text-cyan",
    sections: [
      {
        id: "what-is-tnr",
        title: "What is Tag n Ride?",
        blocks: [
          { type: "para", text: "Tag n Ride (TNR) is South Africa's cashless taxi payment platform. It eliminates the need for physical cash in minibus taxis by providing a fast, secure, and transparent digital payment system that works entirely through a mobile application." },
          { type: "para", text: "The core concept is simple: passengers load money into a digital wallet. When they board a taxi, they scan the driver's unique QR code using the TNR app, enter the fare amount, confirm with their PIN, and the payment is instantly transferred to the driver's wallet. No coins. No notes. No change disputes. No theft risk." },
          { type: "callout", kind: "info", title: "The TNR Vision", text: "Tag n Ride was built to make South African public transport safer, faster, and more dignified for both drivers and passengers. Cash is a major source of crime targeting taxi drivers. TNR removes that risk entirely." },
          { type: "steps", items: [
            "Passenger registers on the TNR app and tops up their wallet using a card or EFT",
            "Passenger boards a taxi and scans the driver's QR code",
            "Passenger enters the trip fare amount and confirms with their 4-digit PIN",
            "Driver receives the payment instantly in their TNR wallet",
            "Driver can withdraw (CashUp) their earnings to their bank account at any time",
          ]},
        ],
      },
      {
        id: "platform-roles",
        title: "Who Uses Tag n Ride?",
        blocks: [
          { type: "para", text: "The TNR platform serves four distinct types of users, each with their own app experience and permissions:" },
          { type: "table", headers: ["Role", "Who They Are", "What They Do"], rows: [
            ["Passenger", "Anyone who rides in a taxi", "Top up wallet, scan QR code, pay for trips, view history, share live location"],
            ["Driver", "Minibus taxi drivers", "Receive payments via QR code, view earnings, CashUp to bank, manage profile, use SafeRide"],
            ["Fleet Owner", "Taxi vehicle owners", "Receive commission split from driver earnings, view fleet performance, manage driver roster"],
            ["Admin", "TNR staff", "Manage the entire platform through the admin panel — users, finances, compliance, safety"],
          ]},
          { type: "callout", kind: "tip", title: "Driver-Mode Owners", text: "A Fleet Owner can also drive their own taxi. In this case they can switch to 'Driver Mode' in the app to receive payments directly, while still managing their other drivers from the Owner section." },
        ],
      },
      {
        id: "revenue-model",
        title: "How Tag n Ride Makes Money",
        blocks: [
          { type: "para", text: "TNR earns revenue through three streams. Understanding this is important for everyone managing the finance pages in the admin panel." },
          { type: "table", headers: ["Revenue Stream", "What It Is", "Who Pays"], rows: [
            ["Platform Fee", "A small percentage deducted from each passenger payment", "Deducted automatically from every transaction"],
            ["Subscription Fee", "Monthly fee charged to active drivers to use the platform", "Billed automatically from the driver's wallet"],
            ["Statement Fee", "Fee charged when a driver downloads their monthly earnings statement", "Deducted when the driver requests a statement"],
          ]},
          { type: "callout", kind: "important", title: "TNR Revenue vs. Gross Volume", text: "Gross Volume is the total rand value of all payments flowing through the platform (what passengers pay). TNR Revenue is only the platform fees and subscriptions — the portion TNR keeps. These are very different numbers." },
        ],
      },
      {
        id: "tech-overview",
        title: "Technical Overview",
        blocks: [
          { type: "para", text: "Tag n Ride is built on modern, reliable technology designed for scale and performance across South Africa's mobile network." },
          { type: "bullets", items: [
            "Mobile App — React Native (Expo) — runs natively on both Android and iOS from a single codebase",
            "Admin Panel — Next.js 14 (React) — the web dashboard you are reading this manual in",
            "Backend API — FastAPI (Python) — the server that processes all transactions and business logic",
            "Database — PostgreSQL — stores all user data, transactions, and platform records",
            "Payments — Paystack integration — handles card top-ups and bank payouts for South African banks",
            "Infrastructure — Railway.app cloud hosting — automatic scaling, 99.9% uptime",
          ]},
          { type: "callout", kind: "tip", title: "The API", text: "The backend runs at https://tag-n-ride-production.up.railway.app. All app screens and admin pages communicate with this server via secure HTTPS requests. The admin panel authenticates using a JWT token stored in your browser." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "passenger",
    number: "02",
    title: "The Passenger Experience",
    subtitle: "Complete walkthrough of every passenger screen and feature",
    icon: Users2,
    color: "text-purple",
    sections: [
      {
        id: "passenger-registration",
        title: "Registration & Login",
        blocks: [
          { type: "para", text: "A new passenger downloads the Tag n Ride app from the Google Play Store or Apple App Store. The registration process takes under two minutes." },
          { type: "steps", items: [
            "Open the app — the Welcome screen appears with two options: 'I'm a Passenger' and 'I'm a Driver/Owner'",
            "Tap 'I'm a Passenger'",
            "Enter your First Name, Surname, and South African cellphone number (e.g. 082 123 4567)",
            "Create a 4-digit PIN — this is used to confirm every payment and secure your account",
            "Tap 'Create Account' — your account is created instantly",
            "You are now on the Home screen with an empty wallet",
          ]},
          { type: "callout", kind: "important", title: "Remember Your PIN", text: "Your 4-digit PIN is the key to your wallet. Never share it with anyone — not even Tag n Ride staff. If you forget it, contact support to have a reset sent to your registered phone number." },
          { type: "para", text: "Returning passengers log in with their phone number and PIN. There is no email or password required — just your phone number and the PIN you created." },
        ],
      },
      {
        id: "passenger-topup",
        title: "Topping Up Your Wallet",
        blocks: [
          { type: "para", text: "The TNR wallet works like a prepaid account. You add money to it before you travel, then spend from it each trip. There is no minimum top-up amount and no expiry on your balance." },
          { type: "steps", items: [
            "On the Home screen, tap the 'Top Up' button (or the + icon on your balance card)",
            "Enter the amount you want to add — minimum R10, maximum R5,000 per transaction",
            "Select your payment method: Card (instant) or EFT (takes 1–2 business days)",
            "For card payments: enter your card details on the secure Paystack payment page",
            "For EFT: use the provided banking details and use your name as the reference",
            "Your wallet is credited immediately (card) or within 1–2 business days (EFT)",
          ]},
          { type: "callout", kind: "tip", title: "Top Up in Advance", text: "We recommend keeping at least R50 in your wallet. Top up the night before rather than at the taxi rank — you do not want to be stuck without balance when your taxi arrives." },
          { type: "callout", kind: "info", title: "FICA Wallet Limits", text: "Until you complete identity verification (KYC), your wallet has spending and balance limits set by FICA regulations. Complete KYC in Settings to unlock higher limits." },
        ],
      },
      {
        id: "passenger-payment",
        title: "Paying for a Trip",
        blocks: [
          { type: "para", text: "Paying a driver with Tag n Ride takes less than 15 seconds. There are two ways to do it: scan the driver's QR code, or enter the driver's TNR code manually." },
          { type: "steps", items: [
            "Board the taxi and locate the driver's Tag n Ride QR card (displayed on the dashboard or sun visor)",
            "Open the TNR app and tap 'Pay' or point the camera at the QR code",
            "The app automatically reads the QR code and shows the driver's name — verify this is correct",
            "Type in the fare amount agreed with the driver (e.g. R12.50)",
            "Review the payment summary: Driver Name, Amount, and your remaining balance after",
            "Enter your 4-digit PIN to confirm the payment",
            "The payment processes instantly — you see a green confirmation screen",
            "The driver's phone buzzes with a payment notification",
          ]},
          { type: "callout", kind: "warning", title: "Always Verify the Driver Name", text: "Before confirming payment, check that the name shown matches the driver in the taxi. Never pay if the name is unfamiliar — someone may have placed a fake QR code." },
          { type: "callout", kind: "tip", title: "No QR Code? Use the Driver's Code", text: "If the QR card is damaged or missing, tap 'Pay' then 'Enter Code Manually'. Ask the driver for their TNR code (a short alphanumeric code on their card) and type it in." },
        ],
      },
      {
        id: "passenger-history",
        title: "Viewing Transaction History",
        blocks: [
          { type: "para", text: "Every payment and top-up is recorded permanently. You can view your full history at any time." },
          { type: "steps", items: [
            "Tap the 'History' tab or 'Transactions' from the home screen",
            "All payments are listed in chronological order — newest first",
            "Each entry shows: Date, Driver Name, Amount Paid, and a Status badge",
            "Tap any entry to see full details including transaction reference number",
          ]},
          { type: "para", text: "If you need a formal statement of your spending — for example for an expense claim or tax purposes — tap 'Statement' in your profile. You can download a PDF for any month." },
        ],
      },
      {
        id: "passenger-safety",
        title: "Passenger Safety Features",
        blocks: [
          { type: "para", text: "Tag n Ride has built-in safety features for passengers travelling in taxis." },
          { type: "bullets", items: [
            "Share Live Location — when you are in a SafeRide trip, a 'Share Live Location' button appears in your profile. Tap it to generate a real-time tracking link you can send to family or friends via WhatsApp. They can watch your journey live without having the TNR app.",
            "SafeRide Profile — go to Profile → SafeRide Profile to set up your emergency contacts and personal safety information. This information is available to the TNR safety team if an SOS is triggered.",
            "SOS Alert — if you are in danger, access the SOS feature in the app. It alerts the TNR safety team with your live location.",
          ]},
          { type: "callout", kind: "important", title: "Dead Man Code (Passenger)", text: "You can set a Dead Man Code in your profile — a secret fake PIN. If someone forces you to 'cancel' an SOS, enter this code instead of your real PIN. It looks like you cancelled but actually keeps the SOS active invisibly and alerts the TNR safety team. Never share this code with anyone." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "driver",
    number: "03",
    title: "The Driver Experience",
    subtitle: "Everything a driver needs to know — registration to CashUp",
    icon: Car,
    color: "text-cyan",
    sections: [
      {
        id: "driver-registration",
        title: "Driver Registration",
        blocks: [
          { type: "para", text: "Driver registration is a two-part process: creating the account and completing identity verification (KYC). The driver can receive payments after creating the account, but CashOut (withdrawing to bank) requires completed KYC." },
          { type: "steps", items: [
            "Download the Tag n Ride app and tap 'I'm a Driver/Owner'",
            "Select 'Driver'",
            "Enter your Full Name, Surname, South African cellphone number",
            "Enter your Vehicle Registration Plate (e.g. ND 123 456)",
            "Create your 4-digit PIN — this secures all your transactions",
            "Tap 'Create Account'",
            "Your unique QR code is generated immediately",
            "To receive withdrawals, complete KYC (see KYC section below)",
          ]},
          { type: "callout", kind: "important", title: "Vehicle Plate", text: "Your vehicle plate is printed on your QR card and displayed to passengers. If you change vehicles, update your plate in Profile → Vehicle Plate immediately." },
        ],
      },
      {
        id: "driver-qr",
        title: "Your QR Code — The Most Important Thing",
        blocks: [
          { type: "para", text: "Your QR code is your payment identity. Every passenger who scans it pays directly to your wallet. Treat it like cash — display it prominently and protect it." },
          { type: "bullets", items: [
            "Printed card — have the admin print your QR card from your driver profile page in the admin panel. The card shows your name, vehicle plate, TNR code, and a scannable QR code with the TNR logo.",
            "In-app QR — tap the 'My QR' tab in the app to show your QR code on-screen. Passengers can scan the screen directly.",
            "Placement — display your printed card on the dashboard, sun visor, or back of the seat in front of passengers.",
            "Multiple copies — print backup cards in case one gets damaged. The admin can reprint at any time.",
          ]},
          { type: "callout", kind: "warning", title: "Protect Your QR Code", text: "Never let someone photograph your QR code who is not a genuine passenger about to pay. Anyone who has your QR code can send payments to your account, but they cannot withdraw your money without your PIN." },
          { type: "callout", kind: "tip", title: "TNR Code", text: "Your TNR code (a short alphanumeric string like TNR-ABCD1234) is printed on your card. Give this to passengers who cannot scan QR codes so they can type it in manually." },
        ],
      },
      {
        id: "driver-receiving",
        title: "Receiving a Payment",
        blocks: [
          { type: "para", text: "When a passenger pays you, you receive an instant notification and your wallet balance increases immediately. No internet connection is required to display your QR code — it is a static image." },
          { type: "steps", items: [
            "Passenger opens their TNR app and scans your QR card",
            "They enter the fare amount and confirm with their PIN",
            "Your phone vibrates and shows a payment notification: 'R12.50 received from [Passenger Name]'",
            "Your wallet balance is updated instantly",
            "You can see the payment in your Home screen under Recent Transactions",
          ]},
          { type: "callout", kind: "info", title: "What if my phone is off?", text: "The payment still processes on TNR's servers. When you next open the app with internet connection, your balance will reflect all payments received. You do not miss payments if your phone is off or has no data." },
        ],
      },
      {
        id: "driver-cashup",
        title: "CashUp — Withdrawing Your Earnings",
        blocks: [
          { type: "para", text: "CashUp is the process of withdrawing your TNR wallet balance to your personal or owner bank account. You need to set up at least one payout account in your profile before you can CashUp." },
          { type: "steps", items: [
            "In Profile → Payout Accounts, add your bank details: bank name, account number, and account name",
            "You can set two accounts: 'My Account' (your personal bank) and 'Owner Account' (if your owner receives their cut separately)",
            "When ready to withdraw, tap 'CashUp' on the Home screen",
            "Enter the amount you want to withdraw",
            "Select which account to withdraw to",
            "Confirm with your PIN",
            "Your withdrawal request is submitted for processing",
            "Funds appear in your bank account within 1–2 business days",
          ]},
          { type: "callout", kind: "important", title: "KYC Required for CashUp", text: "You must complete identity verification (KYC) before you can CashUp. This is a South African legal requirement (FICA). Submit your ID document and selfie through Profile → KYC Verification." },
          { type: "callout", kind: "info", title: "Commission Split", text: "When your owner has a commission split configured, a portion of each payment goes directly to the owner's wallet automatically. Your wallet balance always shows your net amount after the split." },
        ],
      },
      {
        id: "driver-kyc",
        title: "KYC — Identity Verification",
        blocks: [
          { type: "para", text: "KYC (Know Your Customer) is the legal identity verification process required by South African law before anyone can withdraw money from a financial platform. It takes 5 minutes and is reviewed within 24 hours." },
          { type: "steps", items: [
            "Go to Profile → KYC Verification",
            "Take a clear photo of your South African ID book or Smart ID card — front and back",
            "Take a clear selfie holding your ID next to your face",
            "Submit — you will see status 'Under Review'",
            "The admin team reviews your documents within 24 hours",
            "You receive a notification when approved or if you need to resubmit",
          ]},
          { type: "callout", kind: "tip", title: "Good Photo Tips", text: "Take photos in good lighting. Ensure all text on your ID is clearly readable. If your submission is rejected, you will be told exactly what was wrong and can resubmit." },
        ],
      },
      {
        id: "driver-association",
        title: "Taxi Association",
        blocks: [
          { type: "para", text: "If you drive under a registered taxi association, you can declare this in your profile. This links you to the association for monthly payout tracking and reporting." },
          { type: "steps", items: [
            "Go to Profile → scroll to 'TAXI ASSOCIATION'",
            "Tap the 'My Taxi Association' card",
            "A bottom sheet opens listing all registered associations",
            "Tap your association to select it — it saves immediately",
            "Your association name now shows on the card",
            "To change it, tap again and select a different one",
            "To remove the link, select 'None / Independent'",
          ]},
          { type: "callout", kind: "info", title: "Why Does This Matter?", text: "The admin uses your association link to calculate monthly payments. If your association has an agreement with TNR (e.g., TNR pays them R50 per driver per month, or 5% of revenue from your rides), that calculation only works if you are properly linked." },
        ],
      },
      {
        id: "driver-saferide-use",
        title: "SafeRide for Drivers",
        blocks: [
          { type: "para", text: "SafeRide allows drivers to declare an active trip so that their route and location is tracked. If something goes wrong, the TNR safety team can see exactly where they are." },
          { type: "steps", items: [
            "Tap Profile → Trip Centre (or the Trip Centre tab)",
            "Tap 'Start SafeRide Trip'",
            "Select the passenger count and route if prompted",
            "Your location is now being tracked live",
            "If you need help, press the SOS button — the TNR Command Centre is alerted instantly",
            "At the end of the trip, tap 'End Trip'",
          ]},
          { type: "callout", kind: "important", title: "Dead Man Code for Drivers", text: "Set up your Dead Man Code in Profile → Emergency Safety. If you are hijacked and someone forces you to cancel an SOS, enter this code instead of your real PIN. The SOS continues silently and the team is alerted. This could save your life." },
        ],
      },
      {
        id: "driver-profile-full",
        title: "Driver Profile — Every Setting Explained",
        blocks: [
          { type: "para", text: "The Profile screen is your control centre. Here is every section explained:" },
          { type: "table", headers: ["Section", "What It Does"], rows: [
            ["IDENTITY VERIFICATION", "KYC status. Tap to submit or check the status of your ID verification"],
            ["VEHICLE PLATE", "Your current vehicle plate. Tap the pencil icon to edit. Update whenever you change vehicles"],
            ["TAXI ASSOCIATION", "The association you drive under. Tap to select from the list or remove the link"],
            ["PAYOUT ACCOUNTS", "My Account: your personal bank for CashUp. Owner Account: your owner's bank if they receive payment directly"],
            ["FLEET — Switch Owner", "Request a transfer to a new fleet owner. Admin must approve before it takes effect"],
            ["APPEARANCE", "Toggle between dark mode, light mode, and system default"],
            ["ACCOUNT — SafeRide Profile", "Set emergency contacts and medical information. Used if an SOS is triggered"],
            ["ACCOUNT — Trip Centre", "Start and manage SafeRide trips"],
            ["ACCOUNT — Inbox", "View notifications and official documents sent by TNR"],
            ["ACCOUNT — Transaction History", "All your payments received"],
            ["ACCOUNT — Payslip & Statement", "Download your monthly earnings statement"],
            ["ACCOUNT — Change PIN", "Change your 4-digit security PIN. Requires current PIN"],
            ["EMERGENCY SAFETY — Dead Man Code", "Set your secret emergency code. Critical safety feature — see SafeRide chapter"],
            ["SUPPORT — WhatsApp Support", "Opens WhatsApp chat with TNR support directly from the app"],
            ["Sign Out", "Logs you out. You will need your phone number and PIN to log back in"],
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "owner",
    number: "04",
    title: "The Fleet Owner Experience",
    subtitle: "Managing your vehicles, drivers, and earnings as an owner",
    icon: Truck,
    color: "text-cyan",
    sections: [
      {
        id: "owner-registration",
        title: "Owner Registration & Login",
        blocks: [
          { type: "para", text: "Fleet Owners register differently from drivers and passengers — they use an email address and password instead of a phone number and PIN. This is because owners often manage their fleet from a computer." },
          { type: "steps", items: [
            "On the Welcome screen, tap 'I'm a Driver/Owner' then select 'Fleet Owner'",
            "Enter your Business Name, Full Name, Email Address, and create a Password",
            "Optionally enter your South African cellphone number",
            "Tap 'Create Account'",
            "Log in using your email and password",
          ]},
          { type: "callout", kind: "info", title: "Owner vs. Driver Login", text: "Owners log in with email + password. Drivers log in with phone number + PIN. If you own taxis but also drive, register as an Owner and use the 'Driver Mode' toggle to switch between both modes." },
        ],
      },
      {
        id: "owner-dashboard",
        title: "Owner Dashboard",
        blocks: [
          { type: "para", text: "The owner home screen shows a real-time overview of their entire fleet." },
          { type: "bullets", items: [
            "Total Earnings — cumulative commission earned across all drivers",
            "Active Drivers — number of drivers currently registered under your ownership",
            "Today's Revenue — today's total payments across your fleet",
            "Driver Roster — list of all your linked drivers with their current status",
          ]},
        ],
      },
      {
        id: "owner-drivers",
        title: "Managing Drivers",
        blocks: [
          { type: "para", text: "Drivers are assigned to an owner by the admin using the Transfer or Commission Split tools in the admin panel. As an owner, you can view your driver roster and their earnings." },
          { type: "bullets", items: [
            "Driver list — tap any driver to see their total earnings, rating, vehicle plate, and recent transactions",
            "Commission split — the percentage split between you and each driver is set by the admin. Contact your TNR admin to adjust splits",
            "Adding a driver — new drivers must register and then request a transfer to your fleet through the app. The admin approves the transfer",
            "Removing a driver — contact the admin to transfer a driver out of your fleet",
          ]},
        ],
      },
      {
        id: "owner-cashup",
        title: "Owner CashUp",
        blocks: [
          { type: "para", text: "Commission earnings accumulate in your owner wallet. Withdraw them the same way as a driver — tap CashUp, enter the amount, and confirm." },
          { type: "callout", kind: "important", title: "KYC for Owners", text: "Owners must also complete KYC (identity verification) before they can withdraw. Go to Profile → KYC Verification." },
          { type: "callout", kind: "tip", title: "Driver Mode", text: "If you also drive your own taxi, tap 'Switch to Driver Mode' in the owner dashboard. In driver mode, you receive payments via your own QR code. Your driver earnings and owner commission go into separate wallets." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-intro",
    number: "05",
    title: "Admin Panel Overview",
    subtitle: "How to navigate the admin panel and who can access what",
    icon: Monitor,
    color: "text-cyan",
    sections: [
      {
        id: "admin-access",
        title: "Accessing the Admin Panel",
        blocks: [
          { type: "para", text: "The Tag n Ride Admin Panel is a web application accessible at the admin URL. It is separate from the mobile app and is used exclusively by TNR staff to manage the platform." },
          { type: "steps", items: [
            "Open a web browser (Chrome or Firefox recommended) and navigate to the admin URL",
            "Enter your admin email address and password",
            "Click 'Sign In'",
            "The sidebar loads with the pages available to your role",
            "Your role badge appears below your name in the top-left of the sidebar",
          ]},
          { type: "callout", kind: "important", title: "Security", text: "Never share your admin credentials. Always sign out when leaving your workstation (bottom of the sidebar). Sessions expire after inactivity for security." },
        ],
      },
      {
        id: "admin-navigation",
        title: "Navigating the Admin Panel",
        blocks: [
          { type: "para", text: "The sidebar on the left is your main navigation. It is divided into groups that can be expanded and collapsed." },
          { type: "bullets", items: [
            "Quick Access — Dashboard, Alerts, Transactions, Audit Log — always visible at the top",
            "Collapsible groups — People, Fleet, Finance, Analytics, SafeRide, Compliance, Communications, Support, System — click the group label to expand or collapse",
            "Active page indicator — the current page is highlighted in cyan with a small dot on the right",
            "Search bar — type any page name in the sidebar search box to jump directly to it",
            "Theme toggle — at the bottom of the sidebar, switch between Dark, Light, and System theme",
            "Sign out — at the very bottom of the sidebar",
          ]},
        ],
      },
      {
        id: "admin-roles",
        title: "Admin Roles and Access Levels",
        blocks: [
          { type: "para", text: "Every admin account has a role. Your role determines which pages and actions you can access. Pages you do not have permission for simply do not appear in your sidebar." },
          { type: "table", headers: ["Role", "Access Level", "Typical Responsibilities"], rows: [
            ["Superadmin", "Full access to everything", "Platform owner, technical lead. Creates/manages admin accounts"],
            ["CEO", "Full operational access", "Sees all financial data, HR, and analytics. No system console"],
            ["CFO", "Full financial access", "Revenue, payroll, treasury, ledger, reconciliation, statements"],
            ["CTO", "Full technical access", "Console, database, system health, API keys, feature flags"],
            ["Admin", "General operations", "Users, drivers, KYC, support, disputes, transactions"],
            ["Finance", "Financial pages only", "Revenue, settlements, wallets, refunds, chargebacks"],
            ["Support", "Support & user lookup", "Reset PINs, view tickets, answer user queries"],
          ]},
          { type: "callout", kind: "tip", title: "Permission Denied?", text: "If you try to access a page you do not have permission for, you will see a 'Permission Denied' message. Contact your Superadmin to have your role updated." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-people",
    number: "06",
    title: "People Management",
    subtitle: "Managing users, drivers, owners, passengers and KYC",
    icon: Users,
    color: "text-cyan",
    sections: [
      {
        id: "admin-users",
        title: "Users Page — /admin/users",
        blocks: [
          { type: "para", text: "The Users page is the master list of every account on the platform, regardless of role. It is the starting point when you receive a support call and know the user's phone number but not their role." },
          { type: "bullets", items: [
            "Search bar — search by full name, phone number, or ID number. Results appear instantly",
            "Role filter — tabs to show All, Drivers, Passengers, or Owners only",
            "Status filter — filter by Active, Suspended, or Banned",
            "User card — shows name, phone, role badge, KYC status badge, wallet balance, and registration date",
            "Click any user — opens their full profile with all actions available",
          ]},
          { type: "table", headers: ["Action", "What It Does", "Who Can Use"], rows: [
            ["Reset PIN", "Sends a temporary PIN to the user's phone number. They can log in and change it immediately", "Support+"],
            ["Suspend", "Blocks the account from all transactions. The user can still log in and see their balance", "Admin+"],
            ["Unsuspend", "Re-enables a suspended account", "Admin+"],
            ["Ban", "Permanently blocks the account. Requires superadmin approval to reverse", "Superadmin"],
            ["Add Wallet Credit", "Adds a custom amount to the wallet with an internal note (e.g. goodwill credit)", "Finance+"],
          ]},
        ],
      },
      {
        id: "admin-drivers",
        title: "Drivers Page — /admin/drivers",
        blocks: [
          { type: "para", text: "The Drivers page shows all registered driver accounts with their key details. Use this for driver-specific operations." },
          { type: "bullets", items: [
            "Driver list — name, phone number, vehicle plate, verification status (Verified / Pending), KYC status, total lifetime earnings, current wallet balance",
            "Search — by name, phone, plate, or TNR code",
            "Verify Driver button — marks a driver as platform-verified once their documents and KYC are approved",
            "Export button — downloads the full driver list as a CSV file",
            "Click any driver — opens the Driver Detail page",
          ]},
        ],
      },
      {
        id: "driver-detail",
        title: "Driver Detail Page — /admin/drivers/[id]",
        blocks: [
          { type: "para", text: "The Driver Detail page is the most comprehensive page in the admin panel. It gives you complete visibility and control over a single driver account." },
          { type: "table", headers: ["Section", "What It Shows / Does"], rows: [
            ["Profile Card (top left)", "Name, phone, vehicle plate badge, KYC status badge, verification badge, total earnings, average star rating, rating count, TNR QR code"],
            ["Verify Driver button", "Appears if the driver is unverified. Click to mark them as verified — they can now receive payments and appear as 'Verified' to passengers"],
            ["QR Code Card (top right)", "Shows the driver's QR code with TNR logo watermark on a white card styled exactly as the physical card"],
            ["Print QR button", "Opens a print-ready page with the full branded QR card. Use browser print (Ctrl+P) to print physically"],
            ["Download PNG button", "Downloads the QR code as a high-resolution PNG image for sharing or reprinting"],
            ["Taxi Association card", "Dropdown to link or unlink this driver to a taxi association. Select from the list and click 'Link'. Click 'Unlink' to remove"],
            ["Transaction History table", "Every transaction where this driver was sender or receiver — reference, type, amount, net payout, counterparty, status, date"],
          ]},
          { type: "callout", kind: "tip", title: "Reprinting QR Cards", text: "If a driver loses or damages their QR card, go to their detail page, click 'Print QR', and print the card. The QR code never changes — it is permanently linked to the driver's account." },
        ],
      },
      {
        id: "admin-kyc",
        title: "KYC Review — /admin/kyc",
        blocks: [
          { type: "para", text: "KYC (Know Your Customer) is South Africa's legal requirement that financial services verify the identity of their customers. Every driver and owner must be KYC verified before they can CashUp." },
          { type: "steps", items: [
            "Go to KYC Review — you see a queue of pending submissions",
            "Click any submission to open the review view",
            "See the submitted selfie, ID photo, and the user's declared ID number",
            "Verify that the face in the selfie matches the face on the ID",
            "Verify that the ID number is readable and matches what the user entered",
            "If everything is correct: click APPROVE — the user is immediately able to CashUp",
            "If there is a problem: click REJECT, select the reason, and the user is notified to resubmit",
          ]},
          { type: "callout", kind: "warning", title: "Common Rejection Reasons", text: "Blurry ID photo (cannot read the ID number), Selfie does not clearly show the face, Face in selfie does not match the face on the ID, Expired ID document, ID belongs to someone else (potential fraud — escalate immediately)." },
          { type: "callout", kind: "important", title: "Fraud Awareness", text: "If you suspect a KYC submission is fraudulent — for example, the selfie appears to be a photo of a photo, or the ID looks digitally altered — do NOT simply reject. Reject and immediately escalate to the Risk & Fraud team. Document the submission reference." },
        ],
      },
      {
        id: "admin-onboarding",
        title: "Onboarding — /admin/onboarding",
        blocks: [
          { type: "para", text: "The Onboarding page tracks new drivers through every step of getting active on the platform. Use it to proactively help drivers who are stuck in the process." },
          { type: "table", headers: ["Stage", "Meaning", "Action"], rows: [
            ["Registered", "Created an account but not yet submitted KYC", "Send reminder to submit KYC"],
            ["KYC Submitted", "Submitted ID and selfie — awaiting review", "Review their KYC submission (go to KYC Review)"],
            ["KYC Approved", "Identity verified — now needs admin to verify their driver profile", "Verify their driver profile"],
            ["Verified", "Fully onboarded — can receive payments", "No action needed"],
            ["First Payment Received", "Has completed at least one transaction", "Driver is fully active"],
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-fleet",
    number: "07",
    title: "Fleet Management",
    subtitle: "Driver transfers, commissions, documents, deductions, and taxi associations",
    icon: Truck,
    color: "text-cyan",
    sections: [
      {
        id: "fleet-transfers",
        title: "Driver Transfers — /admin/transfers",
        blocks: [
          { type: "para", text: "A Driver Transfer happens when a driver moves from one fleet owner to another — for example, when a driver changes which taxi they drive, or their employer changes." },
          { type: "steps", items: [
            "The driver initiates a transfer request from their app (Profile → Fleet → Switch Owner)",
            "The request appears in this queue with the driver name, current owner, and requested new owner",
            "Review the request — confirm with the driver directly if needed",
            "Click Approve to complete the transfer — the driver is immediately linked to the new owner",
            "Click Reject (with a reason) if the transfer should not proceed",
          ]},
          { type: "callout", kind: "important", title: "Commission Impact", text: "Approving a transfer changes which commission split applies to this driver. Make sure the commission split for the new owner relationship is configured in Commission Splits before approving." },
        ],
      },
      {
        id: "fleet-commissions",
        title: "Commission Splits — /admin/commissions",
        blocks: [
          { type: "para", text: "The commission split determines how a passenger payment is divided between the driver and their fleet owner. For example, a 70/30 split means the driver keeps 70% and the owner receives 30% of every payment." },
          { type: "bullets", items: [
            "The split is applied automatically to every payment in real time — no manual calculation",
            "Each driver-owner pair can have a different split",
            "A platform-wide default applies to new pairs that have no custom split configured",
            "To change a split: find the driver-owner pair, click Edit, enter the new driver percentage, and save",
            "Changes take effect immediately on the next payment",
          ]},
          { type: "callout", kind: "tip", title: "Example", text: "If a passenger pays R20 and the split is 75% driver / 25% owner: the driver's wallet gets R15 (minus the TNR platform fee) and the owner's wallet gets R5." },
        ],
      },
      {
        id: "fleet-documents",
        title: "Document Expiry — /admin/fleet/documents",
        blocks: [
          { type: "para", text: "South African law requires taxi operators to maintain valid documents: operating licences, roadworthy certificates, and public liability insurance. This page tracks expiry dates and alerts you before they lapse." },
          { type: "bullets", items: [
            "Documents expiring in the next 30 days are highlighted red",
            "Documents expiring in 31–90 days are highlighted yellow",
            "Click any row to see the full document details and expiry date",
            "Click 'Send Reminder' to notify the driver or owner via WhatsApp/notification",
            "Click 'Upload Renewed Document' once the driver submits the renewed document",
          ]},
          { type: "callout", kind: "warning", title: "Compliance Risk", text: "An expired operating licence means the vehicle is not legally permitted to operate. If a driver continues operating with an expired licence, TNR could face regulatory liability. Take document expiry seriously." },
        ],
      },
      {
        id: "fleet-deductions",
        title: "Driver Deductions — /admin/fleet/deductions",
        blocks: [
          { type: "para", text: "Deductions are amounts automatically taken from a driver's earnings — for example, a weekly taxi rental fee, equipment cost recovery, or uniform purchase. They are applied before the driver's net earnings are settled." },
          { type: "steps", items: [
            "Click 'Add Deduction'",
            "Select the driver",
            "Enter the amount, description (what the deduction is for), and frequency (once-off, weekly, or monthly)",
            "Set the start date",
            "For installments, set the number of deductions — e.g., 4 weekly payments of R100 to recover a R400 uniform cost",
            "Click Save — the deduction is scheduled",
          ]},
          { type: "callout", kind: "important", title: "Transparency", text: "Each deduction creates a transaction record visible to the driver in their Transaction History. Drivers can see what was deducted and why. Always enter a clear description." },
        ],
      },
      {
        id: "fleet-associations",
        title: "Taxi Associations — /admin/taxi-associations",
        blocks: [
          { type: "para", text: "Taxi associations are the formal bodies that organise and represent taxi drivers in South Africa. Many drivers operate under an association which TNR has a payment agreement with. This page manages those associations and their monthly payouts." },
          { type: "callout", kind: "info", title: "How Association Payments Work", text: "TNR and an association agree on a monthly payment. This can be: (1) a fixed rand amount per driver per month, (2) a flat monthly fee regardless of driver count, or (3) a percentage of TNR's total revenue generated from that association's drivers. The system calculates the amount due and allows you to record or automate the payment." },
        ],
      },
      {
        id: "association-create",
        title: "Creating a Taxi Association",
        blocks: [
          { type: "steps", items: [
            "On the Taxi Associations page, click '+ New Association'",
            "BASIC INFO: Enter the Association Name (e.g., 'eThekwini Taxi Association'), Registration Number, City, and Province",
            "CONTACT: Enter the Contact Person Name, their Phone Number, and Email",
            "BANKING: Enter the association's bank name, account number, account type (Cheque/Savings), and branch code",
            "AGREEMENT: Select the agreement type (Per Driver / Fixed / Percentage) and enter the amount",
            "AUTO-PAYMENT: Toggle on if you want payments to run automatically. Set the day of month (1–28)",
            "NOTES: Any internal notes about this association",
            "Click Save",
          ]},
          { type: "table", headers: ["Agreement Type", "How Amount is Calculated"], rows: [
            ["Per Driver", "Amount × number of active drivers linked to this association that month. E.g., R50 × 20 drivers = R1,000"],
            ["Fixed", "A flat amount every month regardless of driver count. E.g., R2,000/month"],
            ["Percentage", "A percentage of TNR's earned revenue (platform fees + subscription fees + statement fees) from this association's drivers. E.g., 10% of R15,000 revenue = R1,500"],
          ]},
        ],
      },
      {
        id: "association-tabs",
        title: "Association Detail — Tabs Explained",
        blocks: [
          { type: "para", text: "Each association has four tabs on the right panel:" },
          { type: "table", headers: ["Tab", "What You See"], rows: [
            ["Overview", "Banking details card, Agreement terms with calculated monthly obligation, Auto-payment schedule showing next payment date, Contact person details"],
            ["Drivers", "All drivers currently linked to this association with their status and earnings"],
            ["Revenue", "12-month table: Month, Rides, Ride Revenue, Platform Fees, Subscription Fees, Statement Fees, TNR Revenue, and the Amount Owed based on the agreement"],
            ["Payouts", "History of all payments made to this association with reference, amount, date, and status"],
          ]},
          { type: "callout", kind: "tip", title: "Pay Now Button", text: "On the Payouts tab, click 'Pay Now' to record an immediate payout. The system auto-fetches the current month's revenue, calculates the amount owed based on the agreement type, and pre-fills it. You just confirm and enter payment reference details." },
          { type: "callout", kind: "tip", title: "Record Payout", text: "Use 'Record Payout' to log a manual bank payment you have already made. Enter the amount, payment date, and bank reference number. This keeps your records accurate even if you pay outside the system." },
          { type: "callout", kind: "info", title: "Auto-Payment", text: "With auto-payment enabled, the system checks every day at midnight. On the configured day of the month, it automatically records a payout for the calculated amount. You can also manually trigger this with the 'Run Auto-Payments' button." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-finance",
    number: "08",
    title: "Finance & Revenue",
    subtitle: "Revenue, P&L, ledger, withdrawals, refunds, fees, and financial configuration",
    icon: TrendingUp,
    color: "text-green",
    sections: [
      {
        id: "finance-revenue",
        title: "Revenue & P&L — /admin/revenue",
        blocks: [
          { type: "para", text: "The Revenue page is your financial command centre. It shows a complete Profit & Loss statement for any time period you select." },
          { type: "bullets", items: [
            "Range selector — choose Last 7 Days, Last 30 Days, Last 90 Days, or Last 12 Months",
            "Hero strip — four large numbers across the top: Gross Revenue (what TNR earned), Total Expenses (payouts + salaries), Net Profit, and Gross Volume (total money passengers paid)",
          ]},
          { type: "table", headers: ["P&L Line", "What It Means"], rows: [
            ["INCOME — Platform Fees", "All transaction fees earned from passenger payments in the period"],
            ["INCOME — Subscription Fees", "All monthly driver subscription fees billed in the period"],
            ["INCOME — Statement Fees", "All statement download fees collected in the period"],
            ["Total Revenue", "Sum of all three income streams — this is TNR's gross revenue"],
            ["EXPENSES — Association Payouts", "Total paid to taxi associations in the period (click to expand per-association)"],
            ["EXPENSES — Employee Salaries", "Total approved and paid payroll in the period"],
            ["Total Expenses", "Sum of all outgoing expenses"],
            ["NET PROFIT", "Total Revenue minus Total Expenses. The profit margin % is shown"],
          ]},
          { type: "bullets", items: [
            "Right panel — Today: today's revenue vs. yesterday with a trend arrow",
            "Right panel — Pending Obligations: unpaid association invoices and unapproved salaries — money you owe but have not yet paid",
            "Right panel — All-Time Paid Out: cumulative total of every payout since launch",
            "Right panel — System Wallet: current balance in TNR's own wallet with a link to the System Wallet page",
          ]},
        ],
      },
      {
        id: "finance-withdrawals",
        title: "Withdrawals & Payouts — /admin/withdrawals",
        blocks: [
          { type: "para", text: "When a driver or owner initiates a CashUp from the mobile app, the request appears in this queue for processing." },
          { type: "steps", items: [
            "Review the pending request — driver name, amount requested, bank account details, and request time",
            "Verify the bank details are correct (these come from the driver's saved payout account)",
            "Click Approve to initiate the bank transfer",
            "The driver's wallet is debited immediately. Funds reach their bank in 1–2 business days",
            "Click Reject (with a reason) if the request cannot be processed — funds stay in the wallet",
          ]},
          { type: "callout", kind: "important", title: "Verify Before Approving", text: "Always check that the bank account details look legitimate before approving a large withdrawal. Fraudsters sometimes compromise accounts and change bank details. If something looks unusual, call the driver directly to confirm." },
        ],
      },
      {
        id: "finance-refunds",
        title: "Refunds — /admin/refunds",
        blocks: [
          { type: "para", text: "Refunds return money from a completed transaction back to the passenger's wallet. Common reasons: overcharged, driver gave change but shouldn't have, technical double-payment." },
          { type: "steps", items: [
            "In the refund queue, find the refund request — or click 'Manual Refund' to initiate one",
            "Find the original transaction using the reference number or passenger name",
            "Enter the refund amount (can be less than the original if only a partial refund)",
            "Add an internal note explaining why the refund is being processed",
            "Click Approve — the passenger's wallet is credited immediately",
            "The driver's wallet is debited by the same amount",
          ]},
          { type: "callout", kind: "warning", title: "Driver Insufficient Balance", text: "If the driver does not have enough in their wallet to cover the refund (e.g., they have already cashed out), the refund may come from TNR's reserve. Escalate these cases to finance management." },
        ],
      },
      {
        id: "finance-fees",
        title: "Fee & Payout Config — /admin/fee-config",
        blocks: [
          { type: "para", text: "This page controls every fee on the platform. Changes take effect immediately on all future transactions. All changes are logged in the audit trail." },
          { type: "table", headers: ["Fee Setting", "What It Controls"], rows: [
            ["Platform Fee %", "Percentage deducted from each passenger payment as TNR's transaction fee. E.g., 3% of R20 = R0.60"],
            ["Monthly Subscription Fee", "Rand amount billed to each active driver's wallet monthly"],
            ["Statement Download Fee", "Rand amount charged to a driver each time they download their earnings statement"],
            ["CashUp Fee", "Fee (if any) charged when a driver withdraws to their bank. Can be R0"],
          ]},
          { type: "callout", kind: "warning", title: "Changing Fees", text: "Changing the platform fee percentage affects every future transaction immediately. Do not make fee changes without approval from the CEO or CFO. The change will be recorded in the audit log with your name, timestamp, and old/new values." },
        ],
      },
      {
        id: "finance-simulator",
        title: "Fee Simulator — /admin/fee-simulator",
        blocks: [
          { type: "para", text: "Before changing fees, use the simulator to see the exact impact of a proposed change." },
          { type: "steps", items: [
            "Enter a sample transaction amount (e.g. R25)",
            "Enter or adjust the fee percentages you are considering",
            "The simulator shows: what the passenger pays, TNR platform fee, driver net amount, owner commission split, and final driver take-home",
            "Use this to validate that a fee change is fair and commercially viable before applying it",
          ]},
        ],
      },
      {
        id: "finance-system-wallet",
        title: "System Wallet — /admin/system-wallet",
        blocks: [
          { type: "para", text: "The System Wallet holds all TNR's collected revenue — platform fees, subscription fees, and statement fees accumulate here. It is TNR's operating account within the platform." },
          { type: "bullets", items: [
            "Current Balance — total funds currently held in the system wallet",
            "Inflow History — every fee credited: which driver/passenger, what type of fee, how much, when",
            "Outflow History — every debit: association payouts, salary payments, operational expenses",
            "Transfer Funds — move funds from the system wallet to an external account (superadmin only, requires two-factor approval)",
          ]},
          { type: "callout", kind: "important", title: "System Wallet vs. User Wallets", text: "The system wallet holds TNR's own revenue. User wallets (driver and passenger wallets) hold money belonging to those users. Never confuse the two — they are completely separate pools." },
        ],
      },
      {
        id: "finance-subscriptions",
        title: "Subscriptions — /admin/subscriptions",
        blocks: [
          { type: "para", text: "The subscription billing loop runs automatically every night at midnight. It charges the monthly fee to each active driver's wallet. This page lets you monitor and manage subscription billing." },
          { type: "bullets", items: [
            "Active subscriptions — all drivers with their current subscription status and next billing date",
            "Failed billing — drivers whose wallet had insufficient balance to pay the subscription fee. Follow up to collect or waive",
            "Waive fee — skip a month for a specific driver (e.g., they were on extended leave)",
            "Billing history — full record of every subscription charge with payment status",
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-saferide",
    number: "09",
    title: "SafeRide Safety System",
    subtitle: "The complete guide to TNR's life-safety features",
    icon: Shield,
    color: "text-red-400",
    sections: [
      {
        id: "saferide-explained",
        title: "SafeRide — Complete Explanation",
        blocks: [
          { type: "para", text: "SafeRide is Tag n Ride's integrated safety system. It exists because taxi drivers and passengers in South Africa face real safety risks — hijackings, robberies, and assaults. SafeRide cannot stop these incidents, but it dramatically reduces their impact by ensuring help is called, the user's location is known, and evidence is preserved." },
          { type: "callout", kind: "important", title: "This is a Life-Safety System", text: "The SafeRide features — SOS alerts, Dead Man Code, Dead Man Resets — are not administrative tools. They are directly connected to people's physical safety. Handle them with urgency, confidentiality, and care." },
          { type: "bullets", items: [
            "SOS Alert — a manual emergency button. The user presses it when they are in danger. It immediately alerts the TNR Command Centre with their live GPS location",
            "SafeRide Trip — a driver or passenger declares an active trip. Their location is tracked throughout. If the trip goes dark (phone off, route abandoned) the system flags it",
            "Live Location Sharing — passengers can share a real-time tracking link with family or friends. No app required for the recipient",
            "Dead Man Code — a secret decoy PIN. If a hijacker forces the user to 'cancel' an SOS, they enter the Dead Man Code instead. It looks cancelled but remains active. The TNR team is notified silently",
            "Emergency Contacts — users set up contact details in their SafeRide Profile. These are contacted in an emergency",
          ]},
        ],
      },
      {
        id: "saferide-command",
        title: "SafeRide Command Centre — /admin/saferide",
        blocks: [
          { type: "para", text: "The Command Centre is the live view of all active safety events. It should be monitored at all times during operating hours." },
          { type: "steps", items: [
            "When an SOS alert is triggered, it appears at the top of the Command Centre with a red alert banner",
            "Click the alert to see the user's name, phone number, last GPS location, and time of alert",
            "Click 'Locate on Map' to see their live position",
            "Call the user immediately on their registered number",
            "If you cannot reach them — or the situation seems genuine — escalate to law enforcement with the location",
            "Once the situation is resolved, click 'Resolve SOS' and log the outcome",
          ]},
          { type: "callout", kind: "warning", title: "Do Not Dismiss Without Confirming", text: "Never resolve an SOS without first confirming the user is safe — either by speaking to them directly or by law enforcement confirmation. An unresolved SOS that was dismissed in error could cost a life." },
        ],
      },
      {
        id: "deadman-code",
        title: "Dead Man Code — Deep Explanation",
        blocks: [
          { type: "para", text: "The Dead Man Code is one of Tag n Ride's most important safety innovations. Understanding it fully is critical for every admin." },
          { type: "para", text: "Scenario: A driver is hijacked. The hijacker demands they cancel the SOS alert on their phone, or they will be harmed. Normally, cancelling requires entering the real PIN. But if the driver has set a Dead Man Code, they can enter THAT code instead." },
          { type: "bullets", items: [
            "To the hijacker — the SOS appears to cancel normally. The phone screen looks like a normal cancellation",
            "In reality — the SOS remains active on TNR's servers. The driver's location continues to be tracked live",
            "TNR team — receives an immediate silent alert: 'Dead Man Code used. Treat as active emergency.' The team dispatches assistance",
            "The hijacker does not know the alert is still running",
          ]},
          { type: "callout", kind: "important", title: "Dead Man Code Must Be Different From Real PIN", text: "The app enforces this — you cannot set a Dead Man Code that matches your regular PIN. They must be different. If they were the same, the system could not tell them apart." },
        ],
      },
      {
        id: "deadman-resets",
        title: "Dead Man Resets — /admin/saferide/dead-man-resets",
        blocks: [
          { type: "para", text: "Sometimes a user genuinely forgets their Dead Man Code. They can request a reset — which clears the code so they can set a new one. This page manages those requests." },
          { type: "callout", kind: "warning", title: "Treat Reset Requests with Extreme Care", text: "Consider this: if a user is currently being held against their will, a hijacker might force them to request a reset so the Dead Man Code no longer works. Before approving ANY reset, you must verify the user's identity and confirm they are safe. Never approve based only on the written request." },
          { type: "steps", items: [
            "Read the user's reason carefully",
            "Call the user on their registered phone number",
            "Confirm their identity: ask their full name, ID number, and vehicle plate (for drivers)",
            "Ask if they are safe and are requesting this reset of their own free will",
            "If satisfied: click Approve — the user can now set a new Dead Man Code",
            "If unsatisfied or unable to reach them: click Reject with a note. Follow up before reconsidering",
            "Every approval is automatically reported to senior management via the audit log",
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-compliance",
    number: "10",
    title: "Compliance & Risk",
    subtitle: "FICA, KYC, fraud detection, disputes, and regulatory requirements",
    icon: ShieldCheck,
    color: "text-yellow",
    sections: [
      {
        id: "fica-explained",
        title: "FICA and Why It Matters",
        blocks: [
          { type: "para", text: "FICA — the Financial Intelligence Centre Act — is South African law that requires financial service providers to verify the identity of their customers and monitor for suspicious activity. Tag n Ride is a Financial Services Provider and must comply." },
          { type: "bullets", items: [
            "All customers must provide their full name, South African ID number, and address",
            "Customers with transactions above a threshold must complete enhanced verification (KYC)",
            "TNR must report suspicious transactions to the Financial Intelligence Centre (FIC)",
            "Records must be kept for at least 5 years",
            "Failure to comply can result in fines, loss of operating licence, and criminal prosecution of directors",
          ]},
          { type: "callout", kind: "important", title: "Non-Negotiable", text: "FICA compliance is not optional. Never approve a CashUp for a user who has not completed KYC if their withdrawal amount exceeds the legal threshold. When in doubt, escalate to the CFO or legal team." },
        ],
      },
      {
        id: "risk-fraud",
        title: "Risk & Fraud Detection — /admin/risk",
        blocks: [
          { type: "para", text: "The platform has automated fraud detection that flags unusual transactions for human review. Common fraud patterns in mobile payment apps:" },
          { type: "table", headers: ["Fraud Type", "Warning Signs", "Action"], rows: [
            ["Account Takeover", "Login from new device, immediate large CashUp request, changed bank details", "Freeze account, call the user on their registered number to verify"],
            ["Identity Fraud", "KYC selfie appears to be a photo of a photo, ID document looks digitally edited", "Reject KYC, escalate to risk team, flag the account"],
            ["Money Laundering", "Rapid cycle of top-ups and cashouts with no real taxi trips in between", "File Suspicious Transaction Report, freeze account"],
            ["Card Fraud", "Top-up from a card followed immediately by a CashUp — then chargeback", "Hold CashUp pending confirmation, watch for chargeback"],
            ["QR Code Fraud", "Complaints from multiple passengers that payments went to wrong person", "Audit QR code assignments, suspend suspect account"],
          ]},
        ],
      },
      {
        id: "disputes",
        title: "Disputes — /admin/disputes",
        blocks: [
          { type: "para", text: "A dispute is raised when a passenger believes they were charged incorrectly. Disputes must be resolved fairly, quickly, and with a clear audit trail." },
          { type: "steps", items: [
            "Review the dispute — read the passenger's stated reason",
            "Look at the original transaction — amount, time, driver, and GPS location at time of payment",
            "Contact both the passenger and driver if needed to get their accounts of what happened",
            "Make a decision: Rule in Favour of Passenger (refund) or Rule in Favour of Driver (dismiss)",
            "Add detailed notes explaining your decision — this is required for any future audit",
            "The passenger and driver are both notified of the outcome",
          ]},
          { type: "callout", kind: "info", title: "Common Dispute Reasons", text: "Wrong amount entered by passenger, Driver demanded more than the displayed amount, Passenger paid the wrong QR code by mistake, Technical error resulting in double charge. Each case is different — investigate before ruling." },
        ],
      },
      {
        id: "velocity",
        title: "Velocity Monitor & Tx Limits",
        blocks: [
          { type: "para", text: "Velocity monitoring flags users who are transacting at an unusual rate — too many transactions in a short time period. This can indicate fraud (rapid money movement) or a compromised account." },
          { type: "table", headers: ["Concept", "Explanation"], rows: [
            ["Velocity Rule", "A rule that says: if a user completes more than X transactions in Y minutes, flag them"],
            ["Tx Limit", "Maximum rand amount per transaction, per day, or per month. FICA requires lower limits for non-KYC users"],
            ["KYC Limit Uplift", "Once a user completes KYC, their limits are increased to the standard operating level"],
            ["Account Hold", "A temporary block on all transactions while velocity breach is being reviewed"],
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-support",
    number: "11",
    title: "Support Operations",
    subtitle: "Handling user queries, PIN resets, tickets, and escalations",
    icon: HelpCircle,
    color: "text-cyan",
    sections: [
      {
        id: "support-lookup",
        title: "Support Lookup — /admin/support",
        blocks: [
          { type: "para", text: "When a user calls or WhatsApps for help, the Support Lookup page is your primary tool. It is designed for speed — get to the user's information within 5 seconds of receiving the call." },
          { type: "steps", items: [
            "Type the user's name or phone number in the search box — results appear instantly",
            "Click the user to open their profile",
            "You now see: wallet balance, KYC status, recent transactions, account status, and linked accounts",
            "Take the appropriate action based on the user's query (see table below)",
          ]},
          { type: "table", headers: ["Common Query", "Action to Take"], rows: [
            ["'I forgot my PIN'", "Click 'Reset PIN' — a temporary PIN is sent to their registered phone number. They log in and change it immediately"],
            ["'My payment didn't go through'", "Check their recent transactions — look for a failed/pending entry. Check their wallet balance. Check if the account is suspended"],
            ["'The driver didn't receive my payment'", "Find the transaction, check its status. If Completed — it reached the driver. If Failed — initiate a refund"],
            ["'My wallet balance is wrong'", "Review all recent transactions. Look for any unexpected debits. Escalate to finance if something is unexplained"],
            ["'I think my account was hacked'", "Suspend the account immediately. Check for recent unusual logins and transactions. Call the user back on their registered number to verify identity before unsuspending"],
            ["'I want to dispute a payment'", "Get the payment reference. Open a dispute in the Disputes page"],
          ]},
        ],
      },
      {
        id: "support-tickets",
        title: "Support Tickets — /admin/tickets",
        blocks: [
          { type: "para", text: "For issues that cannot be resolved in a single interaction — complex disputes, fraud investigations, technical bugs — create a support ticket to track the issue until it is resolved." },
          { type: "bullets", items: [
            "Title — short description of the issue",
            "Priority — Low (informational), Medium (affects one user), High (affects multiple users), Critical (platform issue or safety concern)",
            "Assign to — the agent or team responsible for resolution",
            "User link — link the ticket to the affected user's account",
            "Internal notes — document all investigation steps — visible only to admins, not the user",
            "Status — Open, In Progress, Awaiting User Response, Resolved",
            "SLA — Critical tickets must have first response within 15 minutes. High within 2 hours",
          ]},
          { type: "callout", kind: "important", title: "Never Close a Safety Ticket as Resolved Until You Are Certain", text: "If a ticket is related to a safety incident (SOS, Dead Man Code, hijacking report), do not mark it Resolved until you have confirmed the user is safe and the matter is fully documented." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-analytics",
    number: "12",
    title: "Analytics & Reporting",
    subtitle: "Understanding platform data, growth metrics, and generating reports",
    icon: BarChart3,
    color: "text-purple",
    sections: [
      {
        id: "analytics-overview",
        title: "Analytics Overview — /admin/analytics",
        blocks: [
          { type: "para", text: "The Analytics Overview gives you a bird's-eye view of the platform's health and growth. This is the page to open in Monday morning meetings when reviewing the previous week." },
          { type: "bullets", items: [
            "Registrations chart — new drivers and passengers registered per day over the selected period",
            "Payment volume chart — rand value of payments per day/week/month",
            "Active users — unique users who made at least one transaction",
            "Geographic heatmap — where transactions are happening — useful for identifying growth opportunities in specific cities",
            "Retention metric — what percentage of users who joined 30 days ago are still transacting today",
          ]},
        ],
      },
      {
        id: "export-center",
        title: "Export Center — /admin/export-center",
        blocks: [
          { type: "para", text: "The Export Center lets you download raw data for external analysis, reporting, or accounting software import." },
          { type: "table", headers: ["Export Type", "What It Contains", "Common Use"], rows: [
            ["Transactions", "Every transaction with all fields", "Accounting software, reconciliation"],
            ["Driver Earnings", "Driver-by-driver earnings summary", "Payslip generation, owner reports"],
            ["KYC Records", "All KYC submissions and statuses", "FICA compliance audit"],
            ["User List", "All registered users with details", "Marketing campaigns, analysis"],
            ["Association Payouts", "All association payout records", "Monthly financial reporting"],
            ["Audit Log", "All admin actions", "Compliance and governance reporting"],
          ]},
          { type: "callout", kind: "info", title: "Large Exports", text: "Very large date range exports are queued and processed in the background. A download link is emailed to you when the export is ready — this can take a few minutes for millions of records." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-comms",
    number: "13",
    title: "Communications",
    subtitle: "Notifications, WhatsApp, promotions, and user messaging",
    icon: Megaphone,
    color: "text-orange-400",
    sections: [
      {
        id: "announcements",
        title: "Announcements — /admin/notifications",
        blocks: [
          { type: "para", text: "Push notifications are sent directly to users' phones. They appear even when the app is closed. Use them for important platform news, maintenance windows, or feature launches." },
          { type: "steps", items: [
            "Click 'New Announcement'",
            "Write a short title (max 50 characters — this is the notification headline)",
            "Write the full message body",
            "Select the target audience: All Users, Drivers Only, Passengers Only, or Owners Only",
            "Optional: select a specific city or province",
            "Schedule for now or for a future date and time",
            "Click Send (or Schedule)",
          ]},
          { type: "callout", kind: "warning", title: "Push Notifications Cannot Be Recalled", text: "Once a push notification is sent, it cannot be unsent. If you send incorrect information, send a follow-up correction immediately." },
        ],
      },
      {
        id: "promotions",
        title: "Promotions — /admin/promotions",
        blocks: [
          { type: "para", text: "Promotions drive user acquisition and retention by offering discounts on fees or wallet credits." },
          { type: "table", headers: ["Promotion Type", "Example"], rows: [
            ["First top-up bonus", "New passenger gets R10 wallet credit on their first top-up"],
            ["Referral reward", "Existing user gets R5 credit when a friend they referred makes their first payment"],
            ["Fee discount", "Platform fee reduced from 3% to 1% for all transactions in December"],
            ["Driver subscription waiver", "First month subscription free for new drivers registering in a campaign period"],
          ]},
          { type: "steps", items: [
            "Click 'Create Promotion'",
            "Enter a promo code (if code-activated), or set it as automatic (no code needed)",
            "Set the discount: rand amount or percentage",
            "Set maximum uses (leave blank for unlimited)",
            "Set the expiry date",
            "Set the target: new users only, specific role, all users",
            "Click Activate",
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-hr",
    number: "14",
    title: "Human Resources & Payroll",
    subtitle: "Managing TNR staff, salaries, and company documents",
    icon: Users2,
    color: "text-yellow",
    sections: [
      {
        id: "hr-staff",
        title: "HR · Staff — /admin/hr",
        blocks: [
          { type: "para", text: "The HR section manages Tag n Ride's internal employees — the people who run the company. This is separate from the drivers and owners who are platform users." },
          { type: "bullets", items: [
            "Employee list — all staff with name, position, department, salary, start date, and status",
            "Add employee — complete name, surname, ID number, position title, department, salary, bank details, and start date",
            "Edit employee — update any detail including salary changes (these take effect in the next payroll run)",
            "Deactivate — mark an employee as inactive when they leave. Their payroll stops. Their records are preserved",
          ]},
        ],
      },
      {
        id: "payroll",
        title: "Payroll — /admin/payroll",
        blocks: [
          { type: "para", text: "Payroll must be run every month. The system generates salary entries for all active employees — you review and approve before any payments are made." },
          { type: "steps", items: [
            "At the start of each month, go to Payroll",
            "Click 'Run Payroll for [Month]'",
            "The system generates a salary entry for each active employee based on their configured salary",
            "Review each line: employee name, gross salary, any deductions, and net pay",
            "If any amounts need adjustment — update the employee's record first, then re-run",
            "Click 'Approve Payroll' to finalise the batch",
            "Process bank transfers to each employee",
            "Once transfers are done, click 'Mark as Paid' — this records the expense in the P&L",
          ]},
          { type: "callout", kind: "info", title: "Payroll and the P&L", text: "Payroll only appears as an expense in the Revenue P&L page once you click 'Mark as Paid'. Approved-but-unpaid payroll shows as a Pending Obligation in the revenue page's right panel." },
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "admin-system",
    number: "15",
    title: "System Administration",
    subtitle: "Superadmin tools, settings, console, database, and system health",
    icon: Settings,
    color: "text-textMuted",
    sections: [
      {
        id: "system-health",
        title: "System Health — /admin/health",
        blocks: [
          { type: "para", text: "System Health gives you real-time visibility into the technical health of the TNR backend. Check this page first if users are reporting problems." },
          { type: "table", headers: ["Indicator", "Healthy Value", "Action If Unhealthy"], rows: [
            ["API Response Time", "< 500ms", "Check server load, database queries. Notify CTO"],
            ["Error Rate", "< 0.5%", "Check error logs in System Console. Notify CTO immediately if > 2%"],
            ["Background Jobs", "All green — last run < 24 hours ago", "Check console for job failure logs. Restart job if needed"],
            ["Database Connections", "< 80% of pool used", "Investigate runaway queries. Notify CTO"],
            ["Uptime", "99.9%+", "Investigate any downtime events in the incident log"],
          ]},
        ],
      },
      {
        id: "admin-accounts",
        title: "Admin Accounts — /admin/admins",
        blocks: [
          { type: "para", text: "Only Superadmins can create, edit, or deactivate admin accounts. This is intentional — admin account management must be strictly controlled." },
          { type: "steps", items: [
            "Go to Admin Accounts",
            "Click 'Add Admin'",
            "Enter the new admin's name, email address, and role",
            "Set a temporary password — the admin must change it on first login",
            "Click Create",
            "The new admin can now log in and will see pages appropriate to their role",
          ]},
          { type: "callout", kind: "warning", title: "Principle of Least Privilege", text: "Give every admin the LOWEST role that allows them to do their job. Do not give Admin role to someone who only needs Support. Do not give Finance role to someone who only needs to view reports. This limits the damage from compromised credentials." },
        ],
      },
      {
        id: "settings-config",
        title: "Settings & Config — /admin/settings",
        blocks: [
          { type: "para", text: "Platform-wide settings that control how the app behaves. Most settings here require Superadmin access." },
          { type: "table", headers: ["Setting", "What It Controls"], rows: [
            ["Support Phone Number", "The number displayed to users in the app for phone support"],
            ["WhatsApp Number", "The number users reach when they tap 'WhatsApp Support'"],
            ["Feature Flags", "Toggle individual features on or off without a code deployment. E.g., disable card top-ups while a payment gateway issue is being fixed"],
            ["Maintenance Mode", "When enabled, a maintenance notice is shown to all app users and new transactions are blocked. Use only during planned maintenance windows"],
            ["Terms & Policy URLs", "The URLs for the Terms of Service and Privacy Policy shown in the app during registration"],
          ]},
        ],
      },
      {
        id: "console",
        title: "System Console — /admin/console",
        blocks: [
          { type: "para", text: "The System Console lets you run backend commands directly. This is the most powerful — and most dangerous — tool in the admin panel." },
          { type: "callout", kind: "warning", title: "Use with Extreme Caution", text: "Every command runs directly on the production server. A mistake can corrupt data, process duplicate payments, or take the system offline. Never run a command you do not fully understand. Always test in the Test Users environment first." },
          { type: "bullets", items: [
            "Pre-set commands — common safe operations (clear expired sessions, re-run a failed billing job, send pending notifications) available as one-click buttons",
            "Custom commands — advanced: enter a command directly. Every custom command requires a second Superadmin to approve before it executes",
            "Command log — every command, who ran it, the timestamp, and the output is permanently logged",
          ]},
        ],
      },
    ],
  },

  // ════════════════════════════════════════════════════════════
  {
    id: "troubleshooting",
    number: "16",
    title: "Troubleshooting & FAQs",
    subtitle: "The most common issues and exactly how to resolve them",
    icon: HelpCircle,
    color: "text-cyan",
    sections: [
      {
        id: "faq-users",
        title: "User Issues",
        blocks: [
          { type: "table", headers: ["Issue", "Steps to Resolve"], rows: [
            ["User cannot log in", "1. Look up the account. 2. Confirm the phone number is correct. 3. Reset their PIN. 4. If account is suspended, unsuspend if appropriate"],
            ["Payment did not reach the driver", "1. Find the transaction by reference or amount+time. 2. Check status — if Pending, wait 60 seconds for processing. If Failed, refund the passenger. If Completed but driver wallet not updated, escalate to tech"],
            ["User wallet balance is incorrect", "1. Review all transactions in the last 24 hours. 2. Look for unexpected deductions (subscription fee, statement fee). 3. If unexplained, freeze the wallet and escalate to finance"],
            ["Driver cannot CashUp", "1. Check KYC status — must be Approved. 2. Check bank details are saved in their profile. 3. Check wallet balance meets minimum withdrawal. 4. Check account is not suspended"],
            ["QR code not scanning", "1. Ask user to confirm they are scanning the correct QR code. 2. Clean the screen or card. 3. Try 'Enter Code Manually' using the TNR code. 4. If still failing, reprint the QR card from admin"],
            ["User says they paid wrong driver", "1. Find the transaction. 2. Confirm the QR code that was scanned. 3. Initiate a refund from the wrong driver's wallet. 4. Advise user to always check the driver name on the confirmation screen before entering PIN"],
          ]},
        ],
      },
      {
        id: "faq-system",
        title: "System Issues",
        blocks: [
          { type: "table", headers: ["Issue", "Steps to Resolve"], rows: [
            ["Subscription billing loop didn't run", "Check System Health — background jobs panel. If the loop shows 'failed', go to System Console and restart the subscription billing loop"],
            ["Auto-payments didn't run on the scheduled day", "Check System Health. If the auto-pay loop failed, go to Taxi Associations and click 'Run Auto-Payments' manually"],
            ["Admin panel not loading", "1. Clear browser cache and reload. 2. Try a different browser. 3. Check System Health for backend errors. 4. Notify CTO if backend is down"],
            ["Notifications not being sent", "Check the Communications → Announcements page for failed sends. Check the WhatsApp integration status in Settings"],
            ["KYC page not loading documents", "Check file size — documents over 10MB may fail to upload. Ask user to compress photos and resubmit"],
          ]},
        ],
      },
      {
        id: "glossary",
        title: "Glossary of Terms",
        blocks: [
          { type: "table", headers: ["Term", "Definition"], rows: [
            ["CashUp", "The process of a driver or owner withdrawing their TNR wallet balance to their bank account"],
            ["FICA", "Financial Intelligence Centre Act — South African law requiring customer identity verification"],
            ["KYC", "Know Your Customer — the identity verification process (ID + selfie)"],
            ["Platform Fee", "The percentage TNR earns from each passenger payment"],
            ["Gross Volume", "Total rand value of all payments processed through the platform"],
            ["TNR Revenue", "Only the fees and subscriptions TNR keeps — not the full payment amount"],
            ["Commission Split", "The percentage division of each payment between driver and fleet owner"],
            ["QR Code", "The unique payment identifier for each driver. Passengers scan it to pay"],
            ["TNR Code", "The alphanumeric version of the QR code (e.g. TNR-ABCD1234). Used for manual entry"],
            ["SOS", "Emergency alert triggered by a user in danger"],
            ["Dead Man Code", "A secret decoy PIN. Entering it appears to cancel an SOS but keeps it secretly active"],
            ["SafeRide", "TNR's safety system — trip tracking, SOS alerts, Dead Man Code"],
            ["Subscription Fee", "Monthly fee charged to active drivers to use the TNR platform"],
            ["Fleet Owner", "The person who owns the taxi vehicle. Receives a commission share from driver earnings"],
            ["Association", "A registered taxi association. TNR may pay them monthly based on a revenue agreement"],
            ["JWT Token", "The security token that authenticates admin panel sessions. Stored in your browser"],
            ["Audit Log", "The permanent record of every action taken by every admin"],
            ["Chargeback", "When a passenger's bank reverses a card top-up — TNR must recover the funds"],
            ["Settlement", "The process of finalising and transferring funds to external banks"],
            ["Velocity", "The rate at which a user transacts. High velocity can indicate fraud"],
            ["Background Job / Loop", "An automated process that runs on a schedule — e.g., nightly subscription billing"],
          ]},
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// RENDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const CALLOUT_STYLES: Record<CalloutType, { bg: string; border: string; icon: any; iconColor: string; titleColor: string }> = {
  info:      { bg: "bg-blue-500/8",   border: "border-blue-400/30",   icon: Info,           iconColor: "text-blue-400",   titleColor: "text-blue-300" },
  tip:       { bg: "bg-cyan/8",       border: "border-cyan/30",       icon: Lightbulb,      iconColor: "text-cyan",       titleColor: "text-cyan" },
  warning:   { bg: "bg-yellow/8",     border: "border-yellow/30",     icon: AlertTriangle,  iconColor: "text-yellow",     titleColor: "text-yellow" },
  important: { bg: "bg-red-500/8",    border: "border-red-400/30",    icon: AlertOctagon,   iconColor: "text-red-400",    titleColor: "text-red-300" },
  success:   { bg: "bg-green/8",      border: "border-green/30",      icon: CheckCircle,    iconColor: "text-green",      titleColor: "text-green" },
};

function RenderBlock({ block, q }: { block: Block; q: string }) {
  const hl = (text: string) => {
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return <>{text.slice(0, idx)}<mark className="bg-yellow/30 text-text rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
  };

  if (block.type === "divider") return <div className="border-t border-border my-6" />;

  if (block.type === "para") return (
    <p className="text-textMuted text-sm leading-relaxed mb-4">{hl(block.text)}</p>
  );

  if (block.type === "steps") return (
    <ol className="space-y-2 mb-4">
      {block.items.map((item, i) => (
        <li key={i} className="flex gap-3 items-start">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan text-bg text-xs font-black flex items-center justify-center mt-0.5">{i + 1}</span>
          <span className="text-textMuted text-sm leading-relaxed">{hl(item)}</span>
        </li>
      ))}
    </ol>
  );

  if (block.type === "bullets") return (
    <ul className="space-y-2 mb-4">
      {block.items.map((item, i) => {
        const parts = item.split(" — ");
        return (
          <li key={i} className="flex gap-2.5 items-start">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan mt-2 flex-shrink-0" />
            <span className="text-textMuted text-sm leading-relaxed">
              {parts.length > 1
                ? <><span className="text-text font-semibold">{hl(parts[0])}</span>{" — "}{hl(parts.slice(1).join(" — "))}</>
                : hl(item)}
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (block.type === "callout") {
    const st = CALLOUT_STYLES[block.kind];
    const Icon = st.icon;
    return (
      <div className={`rounded-xl border p-4 mb-4 ${st.bg} ${st.border}`}>
        <div className="flex gap-3 items-start">
          <Icon size={18} className={`${st.iconColor} flex-shrink-0 mt-0.5`} />
          <div>
            {block.title && <p className={`font-bold text-sm mb-1 ${st.titleColor}`}>{block.title}</p>}
            <p className="text-textMuted text-sm leading-relaxed">{hl(block.text)}</p>
          </div>
        </div>
      </div>
    );
  }

  if (block.type === "table") return (
    <div className="overflow-x-auto mb-4 rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg3">
            {block.headers.map((h, i) => (
              <th key={i} className="text-left px-4 py-3 text-textMuted font-bold text-xs uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-border/50 last:border-0 hover:bg-bg3/40 transition-colors">
              {row.map((cell, ci) => (
                <td key={ci} className={`px-4 py-3 text-sm leading-relaxed align-top ${ci === 0 ? "text-text font-semibold" : "text-textMuted"}`}>
                  {hl(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return null;
}

function SectionCard({ section, q }: { section: Section; q: string }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  const matches = !q || (
    section.title.toLowerCase().includes(q.toLowerCase()) ||
    section.blocks.some(b => {
      if (b.type === "para") return b.text.toLowerCase().includes(q.toLowerCase());
      if (b.type === "steps" || b.type === "bullets") return b.items.some(i => i.toLowerCase().includes(q.toLowerCase()));
      if (b.type === "callout") return (b.text + (b.title || "")).toLowerCase().includes(q.toLowerCase());
      if (b.type === "table") return b.rows.some(r => r.some(c => c.toLowerCase().includes(q.toLowerCase())));
      return false;
    })
  );

  useEffect(() => {
    if (q && matches) setOpen(true);
    if (!q) setOpen(false);
  }, [q]);

  if (!matches) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-bg3 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-text font-bold text-sm">{section.title}</h3>
            {section.path && (
              <span className="font-mono text-[10px] text-textDim bg-bg3 px-2 py-0.5 rounded border border-border">{section.path}</span>
            )}
          </div>
        </div>
        {open ? <ChevronUp size={15} className="text-textDim flex-shrink-0" /> : <ChevronDown size={15} className="text-textDim flex-shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-border bg-bg/30 px-5 py-5">
          {section.blocks.map((b, i) => <RenderBlock key={i} block={b} q={q} />)}
        </div>
      )}
    </div>
  );
}

function ChapterBlock({ ch, q, active, setActive }: { ch: Chapter; q: string; active: string; setActive: (id: string) => void }) {
  const Icon = ch.icon;

  const hasMatch = !q || ch.sections.some(sec =>
    sec.title.toLowerCase().includes(q.toLowerCase()) ||
    sec.blocks.some(b => {
      if (b.type === "para") return b.text.toLowerCase().includes(q.toLowerCase());
      if (b.type === "steps" || b.type === "bullets") return b.items.some(i => i.toLowerCase().includes(q.toLowerCase()));
      if (b.type === "callout") return (b.text + (b.title || "")).toLowerCase().includes(q.toLowerCase());
      if (b.type === "table") return b.rows.some(r => r.some(c => c.toLowerCase().includes(q.toLowerCase())));
      return false;
    })
  );

  if (!hasMatch) return null;

  return (
    <div id={`ch-${ch.id}`} className="mb-12 scroll-mt-24">
      <div className="flex items-start gap-4 mb-6 pb-5 border-b border-border">
        <div className="w-12 h-12 rounded-xl bg-bg2 border border-border flex items-center justify-center flex-shrink-0">
          <Icon size={20} className={ch.color} />
        </div>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-xs text-textDim font-bold">CHAPTER {ch.number}</span>
          </div>
          <h2 className="text-text font-extrabold text-xl leading-tight">{ch.title}</h2>
          <p className="text-textMuted text-sm mt-1">{ch.subtitle}</p>
        </div>
      </div>
      <div>
        {ch.sections.map(sec => <SectionCard key={sec.id} section={sec} q={q} />)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function ManualPage() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("intro");
  const totalSections = CHAPTERS.reduce((s, c) => s + c.sections.length, 0);

  return (
    <AdminShell title="System Manual">
      <div className="max-w-6xl">

        {/* ── Cover ───────────────────────────────── */}
        <div className="mb-10 bg-gradient-to-br from-cyan/5 via-bg2 to-purple/5 border border-border rounded-2xl p-8">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-2xl bg-cyanDim border border-cyan/30 flex items-center justify-center flex-shrink-0">
              <BookOpen size={28} className="text-cyan" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-extrabold text-cyan uppercase tracking-widest px-2.5 py-1 bg-cyanDim border border-cyan/20 rounded-full">Official Reference Guide</span>
              </div>
              <h1 className="text-text font-extrabold text-3xl mb-2">Tag n Ride — System Manual</h1>
              <p className="text-textMuted text-base mb-4 max-w-2xl">
                The complete, authoritative reference for every feature, page, button, and process in the Tag n Ride platform — from the passenger paying for a trip to the superadmin managing the database.
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-textMuted">
                <span className="flex items-center gap-1.5"><BookMarked size={12} className="text-cyan" />{CHAPTERS.length} Chapters</span>
                <span className="flex items-center gap-1.5"><List size={12} className="text-cyan" />{totalSections} Sections</span>
                <span className="flex items-center gap-1.5"><Users size={12} className="text-cyan" />Covers all 4 user roles</span>
                <span className="flex items-center gap-1.5"><Shield size={12} className="text-cyan" />Includes SafeRide safety guide</span>
              </div>
            </div>
          </div>

          {/* Quick chapter links */}
          <div className="mt-6 pt-6 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-2">
            {CHAPTERS.slice(0, 8).map(ch => {
              const Icon = ch.icon;
              return (
                <a key={ch.id} href={`#ch-${ch.id}`}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg border border-border hover:border-cyan/40 hover:bg-cyanDim transition-colors text-xs text-textMuted hover:text-cyan font-semibold">
                  <Icon size={12} />
                  <span className="truncate">{ch.title}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* ── Search ──────────────────────────────── */}
        <div className="relative mb-8 max-w-2xl">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-textDim" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search the entire manual… try 'refund', 'KYC', 'Dead Man Code', 'CashUp', 'association'…"
            className="w-full bg-bg2 border border-border rounded-xl pl-11 pr-10 py-3.5 text-sm text-text placeholder:text-textDim focus:outline-none focus:border-cyan transition-colors"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-textDim hover:text-text text-xs">✕ Clear</button>
          )}
        </div>

        {q && (
          <div className="mb-6 flex items-center gap-2 text-sm">
            <Search size={13} className="text-cyan" />
            <span className="text-textMuted">Results for</span>
            <span className="text-cyan font-semibold">"{q}"</span>
          </div>
        )}

        <div className="flex gap-8">
          {/* ── TOC ─────────────────────────────── */}
          <aside className="hidden xl:block w-56 flex-shrink-0">
            <div className="sticky top-6">
              <p className="text-[9px] font-extrabold text-textDim uppercase tracking-widest mb-3 px-1">Chapters</p>
              <div className="space-y-0.5">
                {CHAPTERS.map(ch => {
                  const Icon = ch.icon;
                  return (
                    <a key={ch.id} href={`#ch-${ch.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-textMuted hover:text-text hover:bg-bg3 group">
                      <span className="font-mono text-[9px] text-textDim w-5 flex-shrink-0 group-hover:text-cyan">{ch.number}</span>
                      <Icon size={11} className={ch.color} />
                      <span className="truncate">{ch.title}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* ── Content ─────────────────────────── */}
          <main className="flex-1 min-w-0">
            {CHAPTERS.map(ch => (
              <ChapterBlock key={ch.id} ch={ch} q={q} active={active} setActive={setActive} />
            ))}

            {/* No results */}
            {q && CHAPTERS.every(ch =>
              !ch.sections.some(sec =>
                sec.title.toLowerCase().includes(q.toLowerCase()) ||
                sec.blocks.some(b => {
                  if (b.type === "para") return b.text.toLowerCase().includes(q.toLowerCase());
                  if (b.type === "steps" || b.type === "bullets") return b.items.some(i => i.toLowerCase().includes(q.toLowerCase()));
                  if (b.type === "callout") return (b.text + (b.title || "")).toLowerCase().includes(q.toLowerCase());
                  if (b.type === "table") return b.rows.some(r => r.some(c => c.toLowerCase().includes(q.toLowerCase())));
                  return false;
                })
              )
            ) && (
              <div className="text-center py-20">
                <BookOpen size={40} className="text-textDim mx-auto mb-4" />
                <p className="text-textMuted text-base mb-2">No results for <span className="text-text font-semibold">"{q}"</span></p>
                <p className="text-textDim text-sm mb-4">Try a different search term — e.g. the feature name, role, or page name</p>
                <button onClick={() => setQ("")} className="text-cyan text-sm hover:underline font-semibold">Clear search and browse all chapters</button>
              </div>
            )}

            {/* Footer */}
            {!q && (
              <div className="mt-12 pt-8 border-t border-border text-center">
                <p className="text-textDim text-xs">Tag n Ride System Manual — Internal Use Only</p>
                <p className="text-textDim text-xs mt-1">For support, contact your system administrator or the technical team</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </AdminShell>
  );
}
