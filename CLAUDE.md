@AGENTS.md

# KSeF SaaS MVP — e-druczek

System SaaS do wystawiania faktur zgodnych z KSeF 2.0 / FA(3) dla JDG (VAT i ZW).
Obowiązek KSeF od 1 kwietnia 2026. Szczegółowa spec: `Dokumentacja Architektury KSeF dla JDG.md`.

## Struktura monorepo

```
apps/
  web/          # Next.js 16 + TypeScript + Tailwind — frontend (Mobile-first)
  api/          # NestJS — backend + BullMQ pipeline
packages/
  shared/       # Typy TypeScript i enumy wspólne dla web i api
supabase/
  migrations/   # 001 users/companies, 002 documents, 003 DLQ/SLA
```

## Uruchamianie

```bash
npm run dev:web     # Next.js na :3000
npm run dev:api     # NestJS na :3001
```

## Kluczowe zasady architektury

- **Data Freeze**: dokument staje się niemutowalny po wejściu w status >= QUEUED (trigger SQL w migracji 002)
- **XML jako source of truth**: PDF generowany zawsze z XML w storage, nigdy z danych w bazie
- **Idempotencja KSeF**: przed retry odpytaj KSeF o faktury z dzisiaj — nie wysyłaj duplikatu
- **Mutex sesji**: Redis key `ksef:lock:{company_id}` z TTL
- **BullMQ queues**: generate-xml → validate-xsd → send-to-ksef → check-status-upo → generate-pdf
- **Limit 10k**: atomiczny SELECT FOR UPDATE w transakcji przed zapisem faktury B2B

## Stack techniczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | NestJS 10, BullMQ, Redis |
| Baza danych | Supabase (PostgreSQL) |
| Typy | `@e-druczek/shared` (packages/shared) |
| Kolejki | BullMQ (generate-xml, validate-xsd, send-to-ksef, check-status-upo, generate-pdf, invoice-offline-sync) |

## Next.js — ważna uwaga

<!-- BEGIN:nextjs-agent-rules -->
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
