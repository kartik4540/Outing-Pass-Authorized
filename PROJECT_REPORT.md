# Outing Pass Authorized — Codebase Investigation Report

> Read-only investigation of the repository as it stands on branch `main` (commit `4eec5d70`).
> No source files were modified. Everything below was derived by reading the code, not by running it.

---

## 1. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18.2 (`react`, `react-dom`) | Function components + hooks; `useReducer` for the big pages |
| Build tooling | **Create React App** (`react-scripts` 5.0.1) | *Not* Next.js — see gotcha #1 |
| Routing | `react-router-dom` 6.22 | All routing in [src/App.js](src/App.js), no route-guard module |
| Backend | **Supabase** (hosted Postgres + PostgREST + Auth) | There is no custom backend server. The React app talks to Postgres directly via the Supabase JS client |
| Auth | `@supabase/supabase-js` 2.49 + `@supabase/auth-ui-react` | Google OAuth, restricted to `@srmist.edu.in` |
| Serverless | 1 Supabase Edge Function (Deno/TypeScript) | [supabase/functions/send-email/index.ts](supabase/functions/send-email/index.ts) |
| Email | **Brevo** transactional email API | Called from inside the Edge Function |
| Spreadsheets | `xlsx` (SheetJS) 0.18.5 | Bulk student/warden import, template download, CSV report |
| Authorization | Postgres **Row Level Security** policies | [supabase/COMPLETE_SCHEMA.sql](supabase/COMPLETE_SCHEMA.sql) |
| Deployment | Vercel (per README) | `homepage: "."` in package.json |

There is **no** TypeScript in `src/` (only the Deno edge function is TS), no test suite beyond the CRA default, and no state management library. Session state lives in React state plus `sessionStorage`.

### Folder layout

```
.
├── public/                     # CRA static shell
│   ├── index.html              # ⚠ still titled "SRM KTR Lab Booking"
│   ├── manifest.json           # ⚠ still named "SRM Lab Booking"
│   └── student_info_template.xlsx
├── scripts/
│   ├── check_supabase.js       # connectivity / table-access smoke test
│   ├── apply_migration.ps1     # ⚠ references supabase/migrations/, which does not exist
│   └── export_supabase_policies.ps1
├── src/
│   ├── index.js                # React entry point → <App />
│   ├── App.js                  # ★ router + role resolution + route guards
│   ├── supabaseClient.js       # ★ single Supabase client instance
│   ├── assets/Srmseal.png
│   ├── components/             # Navbar, Modal, Toast, DarkModeToggle
│   ├── pages/                  # one file per screen (see §9)
│   ├── services/
│   │   ├── api.js              # ★ ALL database access (26 exported functions)
│   │   └── mailTemplates.js    # client-side copies of the email HTML
│   └── utils/
│       ├── wardenHostels.js    # warden session / hostel normalization
│       └── sessionStorage.js   # safe JSON parse helper
├── supabase/
│   ├── COMPLETE_SCHEMA.sql     # ★ functions + indexes + RLS (NO CREATE TABLE)
│   ├── FIX_CASE_INSENSITIVE_RLS.sql   # ⚠ 0-byte empty file
│   ├── config.toml
│   └── functions/send-email/index.ts  # ★ Brevo email edge function
├── .next/                      # ⚠ 79 stale Next.js build artifacts, committed to git
└── README.md                   # ⚠ corrupted by a bad merge (see gotcha #2)
```

**Entry points:**
- Browser: [src/index.js](src/index.js) → [src/App.js](src/App.js)
- Data: every read/write goes through [src/services/api.js](src/services/api.js) → [src/supabaseClient.js](src/supabaseClient.js)
- Email: `POST https://fwnknmqlhlyxdeyfcrad.supabase.co/functions/v1/send-email`

---

## 2. Running It Locally

### Prerequisites
- Node.js 16+
- Access to the existing Supabase project (or your own, with tables created — see the warning below)

### Environment variables

Create `.env.local` in the repo root (it is gitignored):

```env
REACT_APP_SUPABASE_URL=https://<project-ref>.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon-public-key>
```

Both are read in [src/supabaseClient.js:4-5](src/supabaseClient.js#L4-L5). **These are the only two frontend env vars in the whole codebase.** There is no `.env.example` (it is explicitly gitignored), so these names are the only documentation of what's required.

If they're missing, `createClient(undefined, undefined)` throws at import time and the app renders a blank page with a console error — not a friendly message.

### Start the app

```bash
npm install
npm start                 # http://localhost:3000
npm run build             # production build (CI=false so warnings don't fail it)
npm run check:supabase    # verifies connectivity + table access
```

There is no separate frontend/backend to start — the "backend" is hosted Supabase. `npm test` exists but there are no test files.

### Database setup

Run [supabase/COMPLETE_SCHEMA.sql](supabase/COMPLETE_SCHEMA.sql) in the Supabase SQL Editor.

> ⚠ **Critical gap:** that file contains helper functions, indexes, and RLS policies — but **no `CREATE TABLE` statements**. Applying it to a fresh project will fail, because it references `admins`, `wardens`, `arch_gate`, `student_info`, `outing_requests`, and `ban_students`, none of which it creates. There is no migrations directory. Standing up a new environment from this repo alone is not currently possible; the table DDL exists only in the live Supabase project.

### Edge function (email)

```bash
supabase functions deploy send-email
supabase secrets set BREVO_API_KEY=... BREVO_SENDER_EMAIL=...
```

`verify_jwt = false` in [supabase/config.toml](supabase/config.toml), so the function is publicly callable (see gotcha #5).

---

## 3. Data Model

Six tables. Field lists below are **reconstructed from the code's queries and inserts** — since no DDL exists in the repo, types are inferred and there may be additional columns the frontend never touches.

### `student_info` — the roster / eligibility gate
| Field | Notes |
|---|---|
| `id` | PK |
| `student_email` | unique; upsert conflict target; always lowercased |
| `hostel_name` | free text, expected to match `ALLOWED_HOSTEL_NAMES` |
| `parent_email` | lowercased; destination of all notifications |
| `parent_phone` | display/record only — never used to send anything |
| `updated_by` / `created_by` | audit; read but **never written** by the app |

A student who is not in this table cannot use the app at all.

### `outing_requests` — the pass itself
| Field | Notes |
|---|---|
| `id` | PK |
| `name`, `email` | student; `email` drives RLS ownership |
| `hostel_name`, `room_number` | `room_number` is the warden's main search key |
| `out_date`, `out_time`, `in_date`, `in_time` | separate date/time columns, not timestamps |
| `parent_email`, `parent_phone` | copied from `student_info` at request time (denormalized snapshot) |
| `reason` | free text |
| `status` | `waiting` → `still_out` → `confirmed`, or `rejected` |
| `rejection_reason` | set only on reject |
| `handled_by`, `handled_at` | who approved/rejected; a **typed-in name** for wardens, an email for superadmins |
| `otp`, `otp_used` | 6-digit gate code |
| `otp_verified_by`, `otp_verified_at` | arch gate audit |
| `created_at`, `updated_at` | |
| `actual_in_time` | read by the CSV report only; never written anywhere |

### `admins`
`id`, `email`, `role` (`superadmin` or other), `hostels` (text[]). The app only ever selects `id,email,role` — `hostels` is read by the SQL `get_user_roles` RPC, but the client's `fetchAdminInfoByEmail` doesn't request it.

### `wardens`
`id`, `email`, `hostels` (text[]). One row per warden; the hostels array drives every scoping check. In practice the UI only ever assigns **one** hostel (`addWarden(email, [hostel])`).

### `arch_gate`
`id`, `email`. Membership alone grants gate-verification rights.

### `ban_students`
`id`, `student_email`, `from_date`, `till_date`, `reason`, `banned_by`, `is_active`, `created_at`, `updated_at`. Soft-deleted via `is_active = false`.

### Relationships

There are **no foreign keys visible in the code** — every relation is by matching email/hostel string. This matters: renaming a hostel silently orphans warden scoping and student records.

```
                        ┌──────────────┐
                        │    admins    │  email, role, hostels[]
                        └──────┬───────┘
                               │ superadmin manages ↓
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
  ┌───────────┐         ┌──────────────┐       ┌────────────┐
  │  wardens  │         │ student_info │       │ arch_gate  │
  │ email     │         │ student_email│       │ email      │
  │ hostels[] │         │ hostel_name  │       └─────┬──────┘
  └─────┬─────┘         │ parent_email │             │
        │               └──────┬───────┘             │
        │  scope by            │ email match         │ verifies OTP
        │  hostel_name         │ (identity + parent  │
        │                      │  contact source)    │
        ▼                      ▼                     ▼
     ┌──────────────────────────────────────────────────┐
     │              outing_requests                     │
     │  email ──────► student_info.student_email        │
     │  hostel_name ─► wardens.hostels[] (scoping)      │
     │  status, otp, handled_by, parent_email …         │
     └──────────────────────────────────────────────────┘
                               ▲
                               │ blocks creation (checked in UI only)
                        ┌──────┴────────┐
                        │ ban_students  │  student_email, from/till, is_active
                        └───────────────┘
```

**Join keys (all string-matched, no FKs):**

| From | To | Key |
|---|---|---|
| `outing_requests.email` | `student_info.student_email` | email |
| `outing_requests.hostel_name` | `wardens.hostels[]` | hostel name string |
| `ban_students.student_email` | `student_info.student_email` | email |
| `student_info.hostel_name` | `wardens.hostels[]` | hostel name string |

---

## 4. Core Workflows

### 4.1 Student requests an outing pass

Screen: [src/pages/SlotBooking.js](src/pages/SlotBooking.js) — the default `/` route for any logged-in non-arch-gate user.

1. **Login** via Google OAuth (`hd: srmist.edu.in` hint). [App.js](src/App.js) rejects any session whose email doesn't end in `@srmist.edu.in` and signs it out immediately.
2. **Bootstrap** ([SlotBooking.js:113-165](src/pages/SlotBooking.js#L113-L165)): calls `fetchStudentInfoByEmail`. If no row exists, `studentInfoExists` goes false and submission is blocked with *"Student information not found. Please contact administration."* Otherwise `hostelName`, `parentEmail`, `parentPhone` are auto-filled and **the hostel field is not user-editable**.
3. **Ban check**: `checkAndAutoUnban(email)` both expires stale bans (`till_date < today` → `is_active = false`) and returns the active one. An active ban renders a red banner.
4. **Single-active-request rule** ([SlotBooking.js:166-169](src/pages/SlotBooking.js#L166-L169)): if any existing booking is `waiting` or `still_out`, `blockBooking` is set and a new request is refused. The student may delete their own `waiting` request to unblock.
5. **Client validation**: all fields present, valid parent email, `outDateTime >= now`, `inDateTime > outDateTime`. No maximum duration.
6. **Submit**: `bookSlot()` inserts into `outing_requests` with `status: 'waiting'`. **No email is sent at this step.**

### 4.2 Approval / rejection

Screen: [src/pages/PendingBookings.js](src/pages/PendingBookings.js). Reachable by admins and wardens.

The status machine is a **two-stage approval**, which is the single most important thing to understand about this app:

```
   waiting ──[Confirm]──► still_out ──[In]──► confirmed
      │                       │
      │                       └──[Alert]──► (email only, no status change)
      └──[Reject]──► rejected
```

The transition is computed in `processBookingAction` ([PendingBookings.js:249-256](src/pages/PendingBookings.js#L249-L256)) **from the currently selected tab**, not from the row:

- On the **Waiting** tab, "Confirm" → `still_out` ("student has left campus")
- On the **Still Out** tab, "In" → `confirmed` ("student has returned")
- "Reject" → `rejected` from either

> ⚠ The same button means different things depending on which tab you're on. Changing tab-handling logic will change approval semantics.

**Who approves:** wardens (scoped to their hostels) and admins. Both use the same UI. Wardens are additionally prompted by a modal to **type their name**, which is stored verbatim in `handled_by`; superadmins get their email stored automatically ([PendingBookings.js:236-247](src/pages/PendingBookings.js#L236-L247)). Rejections by a superadmin open a rejection-reason modal; warden rejections go through the name modal and pass `reason = null`, so **warden rejections never record a reason**.

**What the DB write does** — `handleBookingAction` in [api.js:299-375](src/services/api.js#L299-L375):
1. Updates `status`, `handled_by`, `handled_at` (+ `rejection_reason` if rejecting).
2. Then, if the row has a `parent_email`, POSTs to the send-email edge function with a template chosen by the new status.

### 4.3 OTP / gate exit flow

1. Student clicks "Generate OTP" on their booking. `generateOtpForBooking` ([api.js:378-420](src/services/api.js#L378-L420)) enforces two rules: **`out_date` must be today** (local date) and **status must be `still_out`**. An existing unused OTP is reused rather than regenerated.
2. Uniqueness comes from a `while` loop that generates a random 6-digit code and re-queries until no collision.
3. At the gate, an `arch_gate` user opens `/arch-otp` ([ArchGateOTP.js](src/pages/ArchGateOTP.js)) and types the code. `fetchOutingDetailsByOTP` rejects it unless `otp_used === false` and `status === 'still_out'`.
4. `markOTPAsUsed` sets `otp_used = true`, `otp_verified_by` (the gate user's email), `otp_verified_at`. Details render on `/arch-outing-details`.

### 4.4 Adding a new student

Screen: [src/pages/AdminStudentInfo.js](src/pages/AdminStudentInfo.js). **Superadmin only** — wardens see a view-only version.

Two paths:
- **Single**: "Add New Student Info" → form with `student_email`, a `hostel_name` **dropdown constrained to the hardcoded list**, `parent_email`, `parent_phone` → `addOrUpdateStudentInfo` upserts on `student_email`.
- **Bulk**: upload `.xlsx/.xls/.csv` with columns `Student Email`, `Hostel Name`, `Parent Email`, `Parent Phone`. `handleExcelUpload` ([AdminStudentInfo.js:245-280](src/pages/AdminStudentInfo.js#L245-L280)) loops rows **one upsert per row, sequentially** — slow for large files, and hostel names are **not validated** on this path (unlike the warden bulk upload, which does validate). A typo'd hostel silently creates an unscoped student.

`student_email` and `parent_email` are lowercased on write; other fields are trimmed but case-preserved.

> Note: the roster is the eligibility gate. Adding a student here is what grants them access to the app at all.

### 4.5 Adding a new hostel

**There is no "add hostel" feature, and no `hostels` table.** A hostel is just a string that appears in three disconnected places:

1. `ALLOWED_HOSTEL_NAMES` — a hardcoded 25-entry array in [AdminStudentInfo.js:92-118](src/pages/AdminStudentInfo.js#L92-L118), used for the student form dropdown.
2. A duplicated **hardcoded JSX list** of the same 25 names rendered as the "use exact names" reference panel ([AdminStudentInfo.js:485-510](src/pages/AdminStudentInfo.js#L485-L510)).
3. `hostelOptions` in [WardenManagement.js:64-68](src/pages/WardenManagement.js#L64-L68), which is **derived at runtime from hostels already assigned to existing wardens** — not from the hardcoded list.

So to introduce a genuinely new hostel you must: edit the array, edit the duplicated JSX list, redeploy, add students with that hostel name — **and** work around the fact that `WardenManagement`'s dropdown cannot offer a hostel no warden has yet, a chicken-and-egg problem that requires a direct DB insert to break.

The existing list also contains what look like duplicates of the same hostels under different spellings (`Esq A` / `Esq-A`, `Esq B` / `Esq-B` / `Esqb`), a strong hint that string drift has already caused problems here.

### 4.6 Creating admin / warden / arch-gate accounts

| Role | How the row is created | Permissions |
|---|---|---|
| **superadmin** | **Manually, directly in the Supabase dashboard.** No UI exists to create an admin. | Everything: all hostels, all requests, student CRUD, warden management, bans |
| **warden** | Superadmin via `/warden-management` — single add, or bulk `.xlsx` upload (`Warden Email`, `Hostel`) | Approve/reject/mark-in for **their hostels only**; view student info (read-only); ban/unban their students |
| **arch_gate** | **Manually in the DB.** No UI. | OTP verification only. `App.js` routes them straight to `/arch-otp` and hides all other nav |
| **student** | Implicitly, by having a `student_info` row | Own requests only |

Warden emails must end in `@srmist.edu.in` (enforced client-side in both the single-add and bulk paths). Note the **bulk warden upload validates hostel names against `hostelOptions`** and rejects unknown ones — stricter than the student upload.

`WardenManagement` also has a **"Delete All"** button that wipes the entire wardens table (`delete().neq('email','')`), guarded only by a confirm dialog and typing "DELETE ALL".

### 4.7 Notifications

**Email only — there is no SMS anywhere in this codebase**, despite `parent_phone` being collected and stored. All email goes to the **parent**, never the student.

| Trigger | Template | Sent from |
|---|---|---|
| `waiting` → `still_out` | `getNowOutEmail` — "your ward has left campus", includes approver | `api.js` `handleBookingAction` |
| `still_out` → `confirmed` | `getReturnedEmail` — "student has returned"; adds a scolding paragraph if closed on a different day than the out date | `api.js` `handleBookingAction` |
| → `rejected` | `getStatusUpdateEmail` — "request rejected" | `api.js` `handleBookingAction` |
| Warden clicks **Alert** on a Still Out row | `still_out` — "your ward has not returned" | `PendingBookings.js` `sendStillOutAlert` |

No email is sent when a request is *submitted*.

Delivery path: client → `POST /functions/v1/send-email` → Brevo API (`api.brevo.com/v3/smtp/email`) using `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` from Deno env.

Two calling conventions coexist: `handleBookingAction` renders HTML **client-side** from [src/services/mailTemplates.js](src/services/mailTemplates.js) and posts `{to, subject, html}`; `sendStillOutAlert` posts `{to, template, booking}` and lets the **function** render. Both template sets exist in full and are near-duplicates (see gotcha #4).

Email failure never blocks the status change — `handleBookingAction` returns an `emailResult` and the UI shows a toast either way.

---

## 5. Authentication & Authorization

### Login

There is exactly one real login path: **Google OAuth via Supabase Auth**, rendered by `@supabase/auth-ui-react` in [src/pages/Login.js](src/pages/Login.js) with `onlyThirdPartyProviders`. The `hd: 'srmist.edu.in'` query param is a Google *hint*, not enforcement; the actual enforcement is in [App.js:69-79](src/App.js#L69-L79) and again in the `onAuthStateChange` handler, which signs out and clears `sessionStorage` for any non-`@srmist.edu.in` address.

[src/pages/WardenLogin.js](src/pages/WardenLogin.js) implements an email+password warden login — but it is **never imported or routed anywhere**. It is dead code. `authenticateWarden` in api.js is likewise only referenced from that dead file.

### Role resolution

`checkAdminStatus` in [App.js:130-193](src/App.js#L130-L193) runs after every session change and makes **three separate queries** — `fetchAdminInfoByEmail`, `fetchWardenInfoByEmail`, `checkArchGateStatus` — setting `isAdmin`/`adminRole`/`adminHostels`, `isWarden`/`wardenHostels`, and `isArchGate`. Results are mirrored into `sessionStorage`.

Note that a `get_user_roles(text)` RPC exists in the schema that does all three in one call, but **the client never calls it**. That optimization was written and never wired up.

Roles are additive: a user in both `admins` and `wardens` gets both flags, and `wardenLoggedIn` takes priority in most UI branches.

### Where the checks live — three layers, decreasing trustworthiness

**1. Route guards** — inline ternaries in [App.js:230-320](src/App.js#L230-L320). E.g. `/warden-management` requires `isAdmin && adminRole === 'superadmin'`, else renders `<Login />`.

**2. Component-level UI gating** — e.g. `AdminStudentInfo` only renders edit/delete/upload controls when `adminRole === 'superadmin' && !wardenLoggedIn`. `banStudent` in [api.js:887-935](src/services/api.js#L887-L935) does an explicit application-level role check before inserting.

**3. Row Level Security in Postgres** — the only layer that actually enforces anything, since the client holds the anon key and could issue arbitrary PostgREST queries. Defined in [supabase/COMPLETE_SCHEMA.sql](supabase/COMPLETE_SCHEMA.sql), built on `SECURITY DEFINER` helpers `get_user_email()`, `is_admin()`, `is_superadmin()`, `is_warden()`, `get_warden_hostels()`.

Effective RLS matrix:

| Table | Student | Warden | Superadmin | Arch gate |
|---|---|---|---|---|
| `outing_requests` | SELECT/INSERT/UPDATE own by email; DELETE own only while `waiting` | SELECT/UPDATE where `hostel_name = ANY(get_warden_hostels())` | ALL | SELECT/UPDATE any row with `status='still_out' AND otp IS NOT NULL` |
| `student_info` | — (no student policy) | SELECT + ALL within assigned hostels | ALL | — |
| `ban_students` | SELECT own | SELECT/INSERT/UPDATE for students in their hostels | ALL incl. DELETE | — |
| `wardens` | — | SELECT own | ALL (gated on `is_admin()`, **not** `is_superadmin()`) | — |
| `admins` | — | — | SELECT own row only | — |
| `arch_gate` | *any authenticated user can SELECT* | same | ALL (`is_admin()`) | SELECT own |

Two things to flag here:

- **`wardens` write access is gated on `is_admin()`, not `is_superadmin()`** — despite the policy being *named* `superadmins_write_all_wardens`. Any row in `admins`, whatever its role, can create/modify/delete wardens at the database level. The superadmin-only restriction on `/warden-management` is UI-only.
- The **`arch_gate` UPDATE policy on `outing_requests` is broad**: `USING (status='still_out' AND otp IS NOT NULL)` with a matching `WITH CHECK` lets any authenticated user update *any* still-out row that has an OTP — it does not verify the actor is in `arch_gate`, nor restrict which columns change.

---

## 6. API Routes / Endpoints

This is not a REST app — there are no application-defined HTTP routes. "Endpoints" means (a) the exported functions in `services/api.js` that wrap PostgREST calls, and (b) the one edge function.

### HTTP endpoints (2)

| Method | URL | Auth | Purpose |
|---|---|---|---|
| `POST` | `{SUPABASE_URL}/functions/v1/send-email` | **None** (`verify_jwt = false`) | Send parent email via Brevo. Accepts either `{to,subject,html}` or `{to,template,booking,statusMsg,wardenEmail}` with `template ∈ now_out \| returned \| status_update \| still_out` |
| `GET` | `.../send-email/health` | None | `{"status":"ok"}` |

Everything else is auto-generated PostgREST (`/rest/v1/<table>`) reached through the Supabase client.

### Data-access functions — [src/services/api.js](src/services/api.js)

**Outing requests**

| Function | Line | Purpose |
|---|---|---|
| `bookSlot(bookingData)` | [23](src/services/api.js#L23) | Insert a new request with `status: waiting` |
| `fetchBookedSlots(email, opts)` | [68](src/services/api.js#L68) | A student's own bookings (default 50, minimal columns) |
| `deleteBookedSlot(slotId)` | [106](src/services/api.js#L106) | Delete a booking (RLS restricts students to their own `waiting` rows) |
| `fetchPendingBookings(adminEmail, allowedHostels)` | [129](src/services/api.js#L129) | Unpaginated admin/warden fetch. **Appears unused by the pages** — superseded by `fetchBookingsFiltered` |
| `fetchBookingsFiltered(opts)` | [179](src/services/api.js#L179) | ★ The main query: status/date/hostel/room filters, pagination, `lateOnly` |
| `handleBookingAction(id, action, adminEmail, reason)` | [299](src/services/api.js#L299) | ★ Status transition + parent email |
| `generateOtpForBooking(id)` | [378](src/services/api.js#L378) | Issue/reuse a 6-digit OTP |
| `updateBookingInTime(id, newInTime)` | [428](src/services/api.js#L428) | Edit expected return time |
| `fetchOutingDetailsByOTP(otp)` | [826](src/services/api.js#L826) | Gate lookup |
| `markOTPAsUsed(otp)` | [858](src/services/api.js#L858) | Burn the OTP, record verifier |

**Student info**

| Function | Line | Purpose |
|---|---|---|
| `addOrUpdateStudentInfo(info)` | [451](src/services/api.js#L451) | Upsert on `student_email` |
| `fetchAllStudentInfo(allowedHostels)` | [472](src/services/api.js#L472) | Full roster (hostel-scoped) |
| `searchStudentInfoWithHostels(q, hostels, opts)` | [503](src/services/api.js#L503) | Three-path search: 6-char prefix fast path, exact-email path, substring path |
| `fetchStudentInfoByEmail(email)` | [676](src/services/api.js#L676) | Single lookup — the eligibility gate |
| `deleteStudentInfo(email)` | [737](src/services/api.js#L737) | Hard delete |
| `downloadStudentInfoTemplate()` | [607](src/services/api.js#L607) | Generate the xlsx template client-side |

**Roles**

| Function | Line | Purpose |
|---|---|---|
| `fetchAdminInfoByEmail(email)` | [697](src/services/api.js#L697) | `id,email,role` from `admins` |
| `fetchWardenInfoByEmail(email)` | [717](src/services/api.js#L717) | `id,email,hostels` from `wardens` |
| `checkArchGateStatus(email)` | [790](src/services/api.js#L790) | Arch gate membership |
| `authenticateWarden(email, password)` | [756](src/services/api.js#L756) | **Dead** — only used by unrouted `WardenLogin.js` |
| `checkApiHealth()` | [808](src/services/api.js#L808) | Probes a `health_check` table, falls back to auth ping |

**Bans**

| Function | Line | Purpose |
|---|---|---|
| `banStudent(banData)` | [887](src/services/api.js#L887) | Insert with overlap check + app-level role check |
| `fetchAllBans()` | [974](src/services/api.js#L974) | All active bans |
| `deleteBan(banId)` | [992](src/services/api.js#L992) | Soft delete (`is_active = false`) |
| `checkStudentBanStatus(email)` | [1020](src/services/api.js#L1020) | Ban covering today |
| `checkAndAutoUnban(email)` | [1041](src/services/api.js#L1041) | ★ Expires stale bans as a side effect of reading |

Warden CRUD (`listWardens`, `addWarden`, `updateWarden`, `deleteWarden`) is **not** in `api.js` — it is defined inline at the top of [WardenManagement.js:6-27](src/pages/WardenManagement.js#L6-L27).

---

## 7. Key Files to Know

Read these first, roughly in this order:

| File | Why it matters |
|---|---|
| [src/services/api.js](src/services/api.js) (1066 ln) | **The single most important file.** Every DB interaction. Change it and you change every page |
| [src/App.js](src/App.js) (324 ln) | Session bootstrap, role resolution, and all route guards in inline ternaries |
| [supabase/COMPLETE_SCHEMA.sql](supabase/COMPLETE_SCHEMA.sql) | The only real security boundary. RLS + helper functions + indexes |
| [src/pages/PendingBookings.js](src/pages/PendingBookings.js) (933 ln) | The approval hub; the tab-driven status machine lives here |
| [src/pages/SlotBooking.js](src/pages/SlotBooking.js) (697 ln) | Student request flow, eligibility + ban + single-request gating |
| [src/pages/AdminStudentInfo.js](src/pages/AdminStudentInfo.js) (685 ln) | Roster management + the hardcoded hostel list |
| [supabase/functions/send-email/index.ts](supabase/functions/send-email/index.ts) | All outbound email; owns the Brevo key |
| [src/utils/wardenHostels.js](src/utils/wardenHostels.js) (44 ln) | Tiny but load-bearing — `getWardenContext` decides warden scoping everywhere |
| [src/supabaseClient.js](src/supabaseClient.js) | Client config; where the env vars land |

### Risky to touch carelessly

1. **[COMPLETE_SCHEMA.sql](supabase/COMPLETE_SCHEMA.sql) RLS policies** — the only thing standing between the public anon key and the whole database. Every policy `DROP`s before `CREATE`ing, so a partial run leaves tables *unprotected*, not unchanged. Never run it half-way against production.
2. **`handleBookingAction`** ([api.js:299](src/services/api.js#L299)) — status transitions *and* parent email in one function. A mistake here either corrupts pass state or emails the wrong parents.
3. **The tab→status mapping in `processBookingAction`** ([PendingBookings.js:249-256](src/pages/PendingBookings.js#L249-L256)) — approval semantics are derived from UI state. Refactoring the tabs will silently change what "Confirm" does.
4. **`getWardenContext`** ([utils/wardenHostels.js](src/utils/wardenHostels.js)) — feeds the `allowedHostels` filter on every warden query. Break it and wardens either see nothing or see other hostels' students.
5. **`ALLOWED_HOSTEL_NAMES` + its duplicated JSX list** — hostel names are join keys. Editing one copy and not the other, or changing a spelling, orphans data.
6. **`fetchBookingsFiltered`** — carries deliberate anti-timeout tuning (7-day window for `lateOnly`, 30-day defaults, prefix-only room search to hit the index). Removing those "arbitrary-looking" date defaults will reintroduce statement timeouts on a large table.
7. **`generateOtpForBooking`** — the collision loop is unbounded; the date check uses local time deliberately (a UTC refactor breaks it near midnight IST).
8. **"Delete All" in WardenManagement** ([WardenManagement.js:120-140](src/pages/WardenManagement.js#L120-L140)) — one click from wiping warden scoping for the whole institution.

---

## 8. Known Gotchas

### 1. The repo has 79 committed Next.js build artifacts, and this is not a Next.js project
`.next/` is tracked in git (79 of 121 tracked files) with compiled routes like `/onboarding` that **do not exist in `src/`**. `.gitignore` covers `build/` but not `.next/`. Leftovers from an abandoned migration or a different project. Harmless at runtime — CRA ignores them — but they pollute diffs and mislead anyone inspecting the tree.

### 2. README.md is corrupted
[README.md](README.md) is 775 lines of **three different README versions merged side-by-side column-wise** by a bad merge. Individual lines read like `# 🎓 Outing Pass Management System# 🎓 Outing Pass Management System# Outing Pass System`. It is not reliable documentation — treat this report as the source of truth and verify anything you take from the README against the code.

### 3. No table DDL and no migrations
`COMPLETE_SCHEMA.sql` defines functions/indexes/policies for six tables it never creates. `scripts/apply_migration.ps1` reads `supabase/migrations/create_get_user_roles_function.sql` — **that directory does not exist**, so the script always fails to its manual-instructions branch. `supabase/FIX_CASE_INSENSITIVE_RLS.sql` is a **0-byte empty file**. You cannot reconstruct the database from this repo.

### 4. Email templates are duplicated in two languages
[src/services/mailTemplates.js](src/services/mailTemplates.js) (JS, client) and [supabase/functions/send-email/index.ts](supabase/functions/send-email/index.ts) (TS, server) contain near-identical copies of all four templates. They have **already drifted**: the server's `getNowOutEmail` renders an "Approved By" line with the warden email; the client's does not. Since three of the four emails render client-side and one renders server-side, editing one file changes only some emails. Any template change must be made in both.

### 5. The email endpoint is unauthenticated and hardcoded
`verify_jwt = false` in [config.toml](supabase/config.toml), and the project URL `https://fwnknmqlhlyxdeyfcrad.supabase.co/functions/v1/send-email` is **hardcoded in two places** ([api.js:338](src/services/api.js#L338), [PendingBookings.js:430](src/pages/PendingBookings.js#L430)) rather than derived from `REACT_APP_SUPABASE_URL`. So: (a) pointing the app at a different Supabase project still sends email through the original one, and (b) anyone on the internet can POST arbitrary `to`/`subject`/`html` and send mail from the institution's Brevo sender. Worth addressing, and worth doing carefully — the URL appears in two files.

### 6. `parent_phone` is collected but never used
Stored on both `student_info` and `outing_requests`, shown in the UI, included in templates and reports — but **no SMS integration exists anywhere**. If someone believes parents get texted, they do not.

### 7. Role checks are duplicated and inconsistent
The same authorization question is asked in up to four places with different answers: route guard, component render gate, app-level check inside the api function, and RLS. Concretely:
- `wardens` table writes are RLS-gated on `is_admin()` while the UI gates on `superadmin` (§5).
- `banStudent` re-implements a role check in JS that RLS already enforces.
- `App.js` reads roles from `sessionStorage` as a "fast fallback" **before** verifying against the DB, so `isWarden`/`isAdmin` briefly reflect client-controlled storage. RLS still protects the data, but UI-only gates are trivially bypassed by editing sessionStorage.

### 8. `handled_by` for wardens is free-typed text
Wardens are prompted to type their name in a modal, and whatever they type becomes the audit trail — no validation, no link to their account — while superadmins get a verified email. The audit column is therefore not trustworthy for warden actions.

### 9. Silent error swallowing
`fetchStudentInfoByEmail`, `fetchAdminInfoByEmail`, `fetchWardenInfoByEmail`, and `checkArchGateStatus` all `catch { return null }`. A network failure, an expired token, and "user genuinely has no role" are indistinguishable — a transient error silently demotes a warden to a plain student. `App.js` compounds this with `.catch(() => null)` at every call site.

### 10. Query defaults are load-bearing, not arbitrary
The 7-day `lateOnly` window, the 30-day default range, the 1-month Still Out window, the 3-char minimum room search, the 6-char minimum student search, prefix-over-substring matching, and `count: 'planned'` are all deliberate defenses against Postgres statement timeouts on a large `outing_requests` table. The code even parses timeout errors to append a hint. Treat these numbers as tuned, not accidental.

### 11. Stale branding
[public/index.html](public/index.html) still has `<title>SRM KTR Lab Booking</title>` and a lab-booking meta description; [public/manifest.json](public/manifest.json) says "SRM Lab Booking"; `package.json` is named `srm-mac-lab-booking-supabase`. `bookSlot`'s docstring still says "Book a lab slot". This project was forked from a lab-booking system and the rebrand was never finished — expect "slot"/"booking" vocabulary throughout where "outing pass" is meant.

### 12. Dead code
[src/pages/WardenLogin.js](src/pages/WardenLogin.js) (email/password warden login) is never imported or routed — it is unreachable, and `authenticateWarden` exists only to serve it. `fetchPendingBookings` appears superseded by `fetchBookingsFiltered`. The `get_user_roles` RPC is defined in SQL and granted to `authenticated` but never called. Don't assume these are live paths.

### 13. `checkAndAutoUnban` mutates on read
Named like a query, but it writes: it flips `is_active = false` on any expired ban it encounters. It is called during student page load, so ban expiry is a side effect of a student visiting the page — a student who never logs in keeps a stale `is_active = true` row. Any caching or memoizing of this call would break ban expiry.

### 14. Miscellaneous fragility
- `App.js:238` calls `sessionStorage.setItem` **inside JSX render** — a side effect during render, which React StrictMode double-invokes.
- `WardenManagement`'s hostel dropdown mutates the row object directly (`row.hostel_selected = e.target.value`) instead of using state.
- `handleSearchChange` in `AdminStudentInfo` stashes its debounce timer on `window.__asi_search_timer` (a global).
- The main `useEffect` in `PendingBookings` deliberately omits `selectedStatus` from its deps with a comment explaining why — an intentional lint violation; re-adding it causes reload loops.
- `fetchBookedSlots` attaches a `counts` property to an **array** (`rows.counts = ...`), which survives in memory but is lost through `JSON.stringify` — and the results *are* cached via `JSON.stringify` in sessionStorage, so counts silently vanish on cache hits.
- `processBookingAction` refreshes data, clears it, then refreshes again on a 100 ms `setTimeout` — a race-condition workaround, not a design.
- `AdminStudentInfo.handleSave` passes a second argument (`adminEmail`) that `addOrUpdateStudentInfo` does not accept, so `updated_by` is never populated despite being displayed as "Last Edited By".

---

## 9. Page → Route Map

| Route | Component | Who can reach it |
|---|---|---|
| `/` | `SlotBooking`, or `ArchGateOTP` if arch gate | Any logged-in user |
| `/slot-booking` | same as `/` | Any logged-in user |
| `/login` | `Login` | Everyone |
| `/pending-bookings` | `PendingBookings` | Warden or admin |
| `/admin-student-info` | `AdminStudentInfo` | Warden (read-only) or admin (superadmin can edit) |
| `/warden-management` | `WardenManagement` | `isAdmin && adminRole === 'superadmin'` |
| `/arch-otp` | `ArchGateOTP` | Arch gate only |
| `/arch-outing-details` | `ArchGateOutingDetails` | Arch gate only |
| — | `WardenLogin` | **Unrouted / dead code** |

No catch-all `*` route is defined — an unknown URL renders the navbar and an empty main area.

---

*Report generated from static reading of the repository. Nothing was executed against the database, and no files other than this report were created or modified.*
