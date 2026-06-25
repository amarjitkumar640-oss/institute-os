# Institute Management System — Plan & Architecture

**Scope of this document:** Phase 1, the operations backbone — leads & admissions, batches, teacher/class allocation (timetable), attendance, and fees — built entirely on free, open-source software. The student-facing test engine is Phase 2 and is noted at the end but not detailed here.

**Domain:** SSC / Banking (IBPS, SBI) / Railway (RRB) exam-prep institute. Android-first user base on budget phones and patchy data.

---

## 1. Design principles

1. **Operations before content.** This system runs the institute even before a single mock test exists. It replaces registers, spreadsheets, and WhatsApp coordination.
2. **Model relationships honestly.** Enrollment and Allocation are their own entities, not columns bolted onto Student or Batch. This is what lets the system grow without painful refactors.
3. **One shared subject taxonomy.** Quant, Reasoning, English, GA/GS, etc. live in one reference table used by allocation, attendance, and (later) the question bank and analytics. No three spellings of "Reasoning".
4. **Roles from day one (even if enforced last).** Admin, Teacher, Front-desk. Retrofitting access control onto a single-superuser system is the worst kind of rewrite.
5. **Fully open source, self-hostable.** No proprietary lock-in. Every core component below is permissively or copyleft licensed and free to run. The few places where "free" gets complicated (WhatsApp/SMS, hosting) are flagged explicitly.

---

## 2. Open-source technology stack

Everything here is FOSS and self-hostable. Nothing requires a paid SaaS to function.

| Layer | Choice | License | Why |
|---|---|---|---|
| Mobile/Web client | **React + Vite PWA** (or **React Native via Expo** if you want a real Play Store app) | MIT | PWA installs from a link, works offline-ish, tiny — ideal for budget Android. Native later if needed. |
| UI styling | **Tailwind CSS** + **shadcn/ui** (or plain components) | MIT | Fast, no runtime cost, themeable to your brand. |
| Backend API | **NestJS** (Node + TypeScript) or **Django REST Framework** (Python) | MIT / BSD | NestJS if you prefer one TS codebase front-to-back; Django if you want batteries-included admin + ORM. |
| Database | **PostgreSQL** | PostgreSQL (BSD-like) | Relational, rock-solid, free. The right fit for this data. |
| Cache / queues | **Redis** | RSAL/BSD (use **Valkey**, the BSD fork, to stay fully open) | Session state, rate limits, background job queue for notifications. |
| Auth | **Self-issued JWT** (NestJS Passport / Django SimpleJWT) or **Keycloak** if you want SSO later | MIT / Apache 2.0 | Roll-your-own JWT is enough at this scale; Keycloak only if you outgrow it. |
| File/photo storage | **MinIO** (S3-compatible) or local disk | AGPL / — | Student photos, ID cards, documents. MinIO behaves like S3 but self-hosted. |
| Background jobs | **BullMQ** (Node) or **Celery** (Python) | MIT / BSD | Fee reminders, absence notifications, report generation. |
| Containerization | **Docker + Docker Compose** | Apache 2.0 | One command to stand up the whole stack on any VPS. |
| Reverse proxy / TLS | **Caddy** or **Nginx** | Apache 2.0 / BSD | Free auto-HTTPS with Caddy. |
| Your own license | **MIT** (permissive) or **AGPL-3.0** (copyleft) | — | MIT = anyone can use/modify freely. AGPL = forces anyone who hosts a modified version to share changes. Pick based on whether you want others' improvements forced back to you. |

### The honest caveats on "free"
- **WhatsApp notifications are not truly free.** The official WhatsApp Business Cloud API has a free tier but charges per conversation beyond it, and unofficial gateways risk bans. Cheapest reliable free-ish path: **SMS via a low-cost Indian gateway**, or in-app + email notifications only to start. Treat WhatsApp as a paid add-on, not a core dependency.
- **Hosting costs money** even with free software. A single small VPS (₹400–800/month) runs this whole stack comfortably for a few hundred students. The *software* is free; the *server* is not.

---

## 3. High-level architecture

```
        +-----------------------------------------------+
        |              CLIENTS (Android-first)          |
        |   PWA (React)  ·  Front-desk web  ·  Teacher   |
        +------------------------+-----------------------+
                                 | HTTPS (Caddy/Nginx)
                                 v
        +-----------------------------------------------+
        |            API SERVER (NestJS/Django)          |
        |  Auth · Admissions · Batches · Allocation ·     |
        |  Attendance · Fees · Roles · Dashboard          |
        +---------+-------------------+----------+--------+
                  |                   |          |
                  v                   v          v
        +--------------+   +--------------+   +--------------+
        | PostgreSQL   |   | Redis/       |   | MinIO        |
        | (core data)  |   | Valkey       |   | (photos,     |
        |              |   | (jobs,       |   |  docs, IDs)  |
        +--------------+   |  cache)      |   +--------------+
                            +------+-------+
                                   v
                       +------------------------+
                       | Worker (BullMQ/Celery) |
                       | fee reminders, absence |
                       | alerts, report exports |
                       +------------------------+
```

A single backend service is correct at this stage — do **not** start with microservices. Split later only if a specific part needs independent scaling.

---

## 4. Core data model

The relationships, stated plainly:
- A **Student** has many **Enrollments** (one per batch joined — a student can do both SSC and banking).
- A **Batch** belongs to a **Course/Track**, has many **Enrollments**, and has many **Allocations**.
- An **Allocation** = one Teacher × one Batch × one Subject × one time slot. (Batches have many; Teachers have many.)
- An **AttendanceSession** references the **Allocation** it belongs to and has many **AttendanceRecords** (one per student).
- A **FeePlan** belongs to an Enrollment and has many **FeePayments**.
- **Subject** is one shared reference table used by Allocation, Attendance, and later the question bank.

### Tables

**`students`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| student_code | text unique | auto-generated, e.g. INS-2026-0142 |
| full_name | text | |
| phone | text | |
| email | text nullable | |
| photo_url | text nullable | MinIO key |
| dob | date nullable | |
| address | text nullable | |
| guardian_phone | text nullable | for absence alerts |
| created_at / updated_at | timestamptz | |

**`leads`** (pre-admission funnel — keep separate from students)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name, phone | text | |
| target_exam | text | SSC / Banking / Railway |
| source | text | walk-in, referral, ad, etc. |
| status | enum | new, contacted, visited, converted, lost |
| assigned_to | uuid FK -> staff | follow-up owner |
| converted_student_id | uuid FK -> students nullable | |
| notes | text | |
| created_at | timestamptz | |

**`courses`** (exam tracks)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | e.g. "SSC CGL Foundation" |
| exam_category | enum | ssc / banking / railway |
| duration_months | int | |
| default_fee | numeric | |

**`batches`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| course_id | uuid FK -> courses | |
| name | text | e.g. "SSC-Morning-A" |
| capacity | int | enforced at enrollment |
| start_date / end_date | date | |
| status | enum | upcoming, running, completed |

**`enrollments`** (the join carrying fee + status — NOT a column on student)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| student_id | uuid FK -> students | |
| batch_id | uuid FK -> batches | |
| enrolled_on | date | |
| status | enum | active, paused, completed, dropped |
| UNIQUE(student_id, batch_id) | | a student joins a batch once |

**`subjects`** (shared taxonomy)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text | Quant, Reasoning, English, GA/GS… |
| exam_category | enum nullable | null = common across all |

**`staff`** (teachers + admin + front-desk)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| full_name, phone, email | text | |
| role | enum | admin, teacher, frontdesk |
| password_hash | text | |
| is_active | bool | |

**`allocations`** (teacher/class allocation = the timetable)
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| teacher_id | uuid FK -> staff | |
| batch_id | uuid FK -> batches | |
| subject_id | uuid FK -> subjects | |
| day_of_week | int | 0–6 |
| start_time / end_time | time | |
| room | text nullable | |
| **conflict rule** | | reject overlapping (teacher, time) and (room, time) on insert/update |

**`attendance_sessions`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| allocation_id | uuid FK -> allocations | ties session to teacher+batch+subject+slot |
| session_date | date | |
| conducted_by | uuid FK -> staff | may differ from allocated teacher = substitution |
| status | enum | held, cancelled |
| UNIQUE(allocation_id, session_date) | | |

**`attendance_records`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK -> attendance_sessions | |
| student_id | uuid FK -> students | |
| status | enum | present, absent, late |
| UNIQUE(session_id, student_id) | | |

**`fee_plans`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| enrollment_id | uuid FK -> enrollments | |
| total_amount | numeric | |
| plan_type | enum | full, installment |

**`fee_payments`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| fee_plan_id | uuid FK -> fee_plans | |
| due_date | date | |
| amount_due | numeric | |
| amount_paid | numeric default 0 | |
| paid_on | date nullable | |
| status | enum | pending, paid, overdue |
| receipt_no | text nullable | |

---

## 5. Modules & key features

### 5.1 Leads & Admissions
- Capture enquiry (lead) -> follow-up list with owner and status -> convert to student + enrollment.
- On conversion: generate `student_code`, capture photo/docs to MinIO, assign batch (capacity-checked), attach fee plan, issue a digital ID card.
- Track lead -> admission conversion rate (your funnel metric).

### 5.2 Batches
- Create once, reuse. Name, course/track, capacity, schedule window, status.
- Block enrollment when at capacity. Auto-flip status by date (upcoming -> running -> completed) via a daily job.

### 5.3 Teacher/Class Allocation (timetable)
- Allocation = teacher × batch × subject × slot, as its own entity.
- **Conflict detection** on save: no double-booked teacher, no room clash.
- Render three ways from the same data: teacher's weekly timetable, batch's weekly timetable, room occupancy.
- Show each teacher's weekly load (hours) for fairness/payroll.
- **Substitution** as a first-class action: mark allocated teacher absent for a session, set `conducted_by` to the substitute — history preserved.

### 5.4 Attendance
- Teacher flow: pick allocation/session -> date -> roster defaulting to present -> mark exceptions -> submit. **Mark-by-exception** is far faster than tapping everyone.
- Logs against the **session (allocation)**, so you know the *quant* class specifically was held and by whom.
- Derived: attendance % per student and per batch; chronic-absentee flag (dropout early warning); optional guardian alert on absence.

### 5.5 Fees
- Fee plan at enrollment (full or installments with due dates).
- Track paid/pending/overdue; generate receipts.
- Dashboard of who owes what; automated reminders (job queue). This feature alone often justifies the build.

### 5.6 Dashboard
- Active students, today's collections, pending/overdue fees, attendance flags, leads to follow up.

### 5.7 Roles & permissions
- **Admin:** everything.
- **Teacher:** own allocations, own attendance, own students' attendance views — **no fee data**.
- **Front-desk:** leads, admissions, fees — limited academic edit rights.

---

## 6. Build roadmap (sequenced)

**Milestone 0 — Foundation (week 1)**
Docker Compose stack up (Postgres, Redis/Valkey, MinIO, API, client). Auth + staff accounts. Subject reference table seeded.

**Milestone 1 — Core entities & admissions**
Student/Batch/Course CRUD -> Lead capture -> Admission/enrollment flow with capacity check + fee plan. (No content = no app, so structure comes first.)

**Milestone 2 — Allocation & timetable**
Allocation entity + conflict detection + the three timetable views + substitution.

**Milestone 3 — Attendance**
Session-based, mark-by-exception, derived attendance %, absentee flags.

**Milestone 4 — Fees & notifications**
Payment tracking, receipts, reminder jobs, guardian/absence alerts.

**Milestone 5 — Dashboard & roles**
Aggregate dashboard. Enforce role-based access across every endpoint.

**Milestone 6 — Hardening**
Offline-tolerant client behavior, backups (automated `pg_dump` to MinIO), audit logging.

> Build roles conceptually from Milestone 0 (tag every endpoint with required role) even though enforcement lands in Milestone 5.

---

## 7. Phase 2 preview (not built here)
Student-facing test engine: bilingual question bank, exam-accurate UI (TCS/IBPS palette, section locking, negative marking), resilient local-save + sync, topic-wise analysis and percentiles, teacher-linked doubts and solution videos, optional adaptive practice. It reuses the **same `subjects` taxonomy** and the same auth/roles, which is exactly why getting Phase 1's model right matters.

---

## 8. Repository layout (suggested, for open-source release)

This repo follows this layout, with the backend/client choices below finalized as Express+Prisma and React Native (Expo) respectively (see Section 2 for the originally proposed alternatives):

```
/institute-os
  /apps
    /api          # Express + Prisma backend (TypeScript)
    /mobile       # React Native (Expo) client
  /packages
    /shared       # shared types / DTOs
  /infra
    docker-compose.yml
    Caddyfile
  LICENSE
  README.md
```

A clean monorepo with a clear LICENSE, README (setup + screenshots), and CONTRIBUTING guide is what makes an open-source project actually adoptable by other institutes — which, if that's your goal, becomes your distribution channel.
