<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `apps/web/node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Projekt: E-druczek — KSeF SaaS MVP dla JDG

## Struktura monorepo

```
apps/
  web/          # Next.js 16 + TypeScript + Tailwind — frontend mobile-first (:3000)
  api/          # NestJS 10 — backend REST + BullMQ pipeline (:3001)
packages/
  shared/       # @e-druczek/shared — typy TypeScript i enumy (bez runtime deps)
supabase/
  migrations/   # SQL: 001 users/companies, 002 documents, 003 DLQ/SLA
```

## Zasady dla agentów

### Ogólne
- Zawsze czytaj `PLAN.md` przed rozpoczęciem pracy — tam jest aktualny stan i priorytety
- Szczegółowa specyfikacja systemu: `Dokumentacja Architektury KSeF dla JDG.md`
- Nigdy nie commituj plików `.env` — tylko `.env.example`

### apps/web (Next.js)
- App Router (`app/`) — nie używaj `pages/`
- Tailwind CSS 4 — sprawdź docs przed użyciem, API się zmieniło
- Typy importuj z `@e-druczek/shared`
- Real-time statusy przez SSE (nie WebSocket)

### apps/api (NestJS)
- Każdy moduł w osobnym folderze: `src/<moduł>/<moduł>.module.ts`
- Walidacja DTO przez `class-validator` + `class-transformer`
- Supabase: używaj `service_role` key tylko po stronie API, nigdy nie eksponuj na frontend
- Redis mutex dla sesji KSeF: klucz `ksef:lock:{company_id}` z TTL
- BullMQ: `concurrency: 1` dla workerów wysyłkowych (send-to-ksef)

### packages/shared
- Tylko typy i enumy — zero zależności runtime
- Po każdej zmianie uruchom `npm run build --workspace=packages/shared`

### supabase/migrations
- Pliki numerowane: `001_`, `002_`, `003_`...
- Nigdy nie modyfikuj istniejących migracji — dodaj nową
- Data Freeze trigger jest w migracji 002 — nie omijaj go

### Krytyczne reguły biznesowe
- **Data Freeze**: dokument >= QUEUED jest niemutowalny (egzekwowane przez trigger SQL)
- **XML source of truth**: PDF generuj zawsze z XML ze storage, nigdy z danych DB
- **Deduplikacja KSeF**: przed retry zawsze odpytaj KSeF czy nie przyjął już dokumentu
- **Limit 10k**: używaj `check_monthly_b2b_limit()` w transakcji z `FOR UPDATE`
- **B2C → B2B blokada**: korekta faktury B2C z dopisaniem NIP jest bezwzględnie zablokowana
