# Plan Implementacji — KSeF SaaS MVP dla JDG
**Projekt:** E-druczek  
**Wersja dokumentacji:** v5.1  
**Deadline twardy:** 1 kwietnia 2026 (obowiązek KSeF dla JDG)

---

## Jak używać tego pliku
- `[ ]` — do zrobienia
- `[x]` — zrobione
- `[~]` — w trakcie
- Każdy etap kończy się **punktem kontrolnym** — sprawdzamy czy działa zanim idziemy dalej

---

## ETAP 0 — Fundament projektu
*Cel: mieć działające repo z właściwą strukturą, żeby Claude Code wiedział co robi*

- [x] Dokumentacja architektury w repo (`Dokumentacja Architektury KSeF dla JDG.md`)
- [x] Restrukturyzacja monorepo:
  - [x] `apps/web/` — przeniesienie obecnego Next.js
  - [x] `apps/api/` — scaffold NestJS
  - [x] `packages/shared/` — folder na wspólne typy
  - [x] `supabase/migrations/` — folder na migracje SQL
- [x] Aktualizacja `CLAUDE.md` z nową strukturą
- [x] Aktualizacja `AGENTS.md` z nową strukturą
- [x] Plik `.env.example` dla `apps/api` i `apps/web`
- [x] `README.md` z instrukcją uruchomienia projektu

**✅ Punkt kontrolny E0:** `git clone` + `npm install` działa bez błędów

---

## ETAP 1 — Baza danych (Supabase)
*Cel: działający schemat bazy z RLS, gotowy do przyjęcia danych*

- [x] Założenie projektu Supabase (pazvyykomhscnassdhce)
- [x] Uruchomienie migracji:
  - [x] `001_init_users_companies.sql` — users, companies, ksef_connections
  - [x] `002_documents.sql` — documents, document_items + Data Freeze trigger
  - [x] `003_monitoring_dlq.sql` — SLA views, failed_jobs, funkcja limitu 10k
- [x] Weryfikacja triggerów (Data Freeze zweryfikowany — blokuje mutację QUEUED; handle_new_auth_user działa)
- [x] Migracja 004: RLS policies + integracja z auth.users
- [x] Supabase Auth — konfiguracja (email/password, Site URL, Redirect URLs)
- [x] Zmienne środowiskowe w `.env` (lokalnie, nigdy w repo)

**✅ Punkt kontrolny E1:** Można założyć usera, firmę i dokument przez SQL Editor

---

## ETAP 2 — Backend NestJS — szkielet
*Cel: działające API z połączeniem do Supabase i Redis*

- [x] Inicjalizacja projektu NestJS w `apps/api`
- [x] Moduły bazowe:
  - [x] `AuthModule` — guard weryfikujący Supabase JWT
  - [x] `CompaniesModule` — CRUD firm
  - [x] `DocumentsModule` — CRUD dokumentów (bez KSeF na razie)
- [x] Połączenie z Supabase (service role key) — `SupabaseModule` global
- [x] Połączenie z Redis (BullMQ) — działa, kolejki zarejestrowane
- [x] Współdzielone typy w `packages/shared` (enums, DTO) — CommonJS build
- [x] Walidacja DTO (class-validator) — globalny ValidationPipe (whitelist, transform)
- [x] Globalny error handler — `AllExceptionsFilter`

**✅ Punkt kontrolny E2:** `POST /companies` i `POST /documents` działają, dane lądują w Supabase — **zweryfikowane end-to-end** (user przez Supabase Auth, JWT, curl POST → 201, GET zwraca dane)

---

## ETAP 3 — Generator XML FA(3)
*Cel: generowanie poprawnego XML zgodnego ze schematem KSeF 2.0*

- [x] Pobranie schematu XSD FA(3) z MF (FA-3.xsd, StrukturyDanych, ElementarneTypy — 3 pliki z crd.gov.pl)
- [x] `XmlGeneratorService` — generowanie XML z danych dokumentu:
  - [x] Faktura VAT (stawki 23%, 8%, 5%, 0%) — Scenario 1 test ✓
  - [x] Faktura ZW (węzły P_19A / P_19B / P_19C per pozycja) — Scenario 2 test ✓
  - [x] Faktura korygująca (model delta, NrKSeF vs NrKSeFN) — Scenario 3 test ✓
- [x] `XsdValidatorService` — stub (xmllint-wasm zaload async przy bootstrap)
- [x] Testy jednostkowe generatora — 17 testów, wszystkie ✓
- [ ] Zapis XML do Supabase Storage (w E5 + endpoint POST /api/documents/:id/generate-xml)
- [ ] Pełny test XSD walidacji (wymaga dbg z xmllint-wasm)

**⚠️ Punkt kontrolny E3:** `XmlGeneratorService` przechodzi 17 testów; `XsdValidatorService` czeka na weryfikację xmllint-wasm (w E3-advanced lub E4)

---

## ETAP 4 — Integracja KSeF (środowisko testowe)
*Cel: wysłać pierwszą fakturę do api-test.ksef.mf.gov.pl i odebrać numer KSeF*

- [x] Token KSeF wygenerowany na środowisku testowym (NIP: 5260250274)
- [x] `KsefCryptoService`:
  - [x] RSA-OAEP SHA-256 z dwoma osobnymi certyfikatami MF (KsefTokenEncryption + SymmetricKeyEncryption)
  - [x] AES-256-CBC szyfrowanie XML faktur
  - [x] SHA-256 hashing
- [x] `KsefApiClient` — typowany HTTP client (12 endpointów KSeF API v2)
- [x] `KsefSessionService`:
  - [x] Challenge → auth → token redeem → session open
  - [x] Mutex Redis (`ksef:lock:{company_id}`)
  - [x] Zamknięcie sesji + auth terminate
- [x] `KsefSendService`:
  - [x] Encrypt XML (AES) + send do KSeF
- [x] `KsefStatusService`:
  - [x] Polling UPO (5s interval, max 15 min)
  - [x] Pobranie ksefNumber per faktura
- [x] E2E test: faktura VAT wysłana → **numer KSeF: `5260250274-20260412-74E844800000-86`**
- [x] Poprawki namespace FA(3): `http://crd.gov.pl/wzor/2025/06/25/13775/`
- [x] Poprawki XSD: `P_22N`, `RodzajFaktury`, brak `P_22` w `TWybor1`
- [ ] Deduplikacja przed retry (do zaimplementowania w E5)
- [ ] Retry z backoff + DLQ (do zaimplementowania w E5)

**✅ Punkt kontrolny E4:** Faktura VAT wysłana do testowego KSeF, odebrany numer KSeF `5260250274-20260412-74E844800000-86`, status 200 (sukces) — **ZWERYFIKOWANE**

---

## ETAP 5 — Pipeline kolejek BullMQ
*Cel: niezawodny, idempotentny pipeline wysyłki*

- [x] Konfiguracja BullMQ + Redis + @nestjs/schedule
- [x] Kolejki i workery:
  - [x] `generate-xml` worker — buduje XML z danych DB, upload do Supabase Storage
  - [x] `validate-xsd` worker + Data Freeze w DB (graceful skip gdy xmllint-wasm niedostępny)
  - [x] `send-to-ksef` worker (concurrency: 1) — sesja KSeF, encrypt, send, close
  - [x] `check-status-upo` worker (polling z timeoutem 15 min, mapowanie ACCEPTED/REJECTED/TIMEOUT)
  - [x] `generate-pdf` worker (stub — pełna implementacja w E7)
  - [ ] `invoice-offline-sync` worker (Offline24 — do E8)
- [x] Dead Letter Queue — `DlqService` zapisuje do `failed_jobs`
- [x] CRON monitoring SLA (co 1 min) — `SlaMonitorService`:
  - [x] Alert QUEUED_STUCK (> 5 min)
  - [x] Alert PROCESSING_STUCK (> 10 min)
  - [x] Alert OFFLINE_CRITICAL (< 2h do deadline)
- [x] Endpoint `POST /documents/:id/submit` — DRAFT → QUEUED → pipeline
- [ ] Deduplikacja przed retry (do zaimplementowania po testach E2E)
- [ ] Retry z backoff + DLQ (send-to-ksef ma 3 attempts z exponential backoff)

**✅ Punkt kontrolny E5:** Pipeline E2E zweryfikowany — DRAFT→QUEUED→PROCESSING→ACCEPTED→PDF GENERATED w ~9s. KSeF nr: `5260250274-20260414-94F6F0400000-AC`. Supabase Storage bucket `documents` ✓

---

## ETAP 6 — Frontend Next.js
*Cel: działający interfejs użytkownika, mobile-first*

- [x] Supabase Auth — logowanie / rejestracja z kodem zaproszenia (`app/login/page.tsx`)
- [x] Onboarding — formularz danych firmy (NIP, nazwa, adres, status VAT) (`app/onboarding/page.tsx`)
- [x] Dashboard główny:
  - [x] Lista faktur z statusami KSeF (real-time SSE)
  - [x] Tracker limitu 10 000 zł z paskiem postępu
- [x] Formularz wystawiania faktury:
  - [x] Dynamiczny (VAT_ACTIVE → stawki VAT, ZW/NP → podstawa prawna)
  - [x] Przełącznik B2B / B2C
  - [x] Pozycje faktury (dodawanie, usuwanie, auto-kalkulacja)
  - [x] Walidacja po stronie klienta (NIP, kwoty)
- [ ] Formularz faktury korygującej (`/invoices/[id]/correct`) — do zaimplementowania
- [x] Widok faktury — numer KSeF, pozycje, przyciski submit/PDF/korekta
- [x] Real-time statusy SSE (QUEUED → PROCESSING → ACCEPTED)
- [x] PWA — manifest.json, theme-color zielony, standalone
- [x] Navbar — sidebar (desktop) + bottom nav (mobile)
- [x] StatusBadge — 9 statusów z kolorami
- [x] Proxy (Next.js 16) — ochrona tras, redirect na /login
- [x] Fix: Turbopack monorepo — tailwindcss hoisted do root node_modules

**⚠️ Punkt kontrolny E6:** UI zbudowany i renderuje się poprawnie (zweryfikowane preview). Brakuje formularza korekty (`/invoices/[id]/correct`). Backend E2E zweryfikowany w E5/E7.

---

## ETAP 7 — Generowanie PDF
*Cel: PDF z kodem QR zgodny z wymogami MF*

- [x] `PdfGeneratorService` — PDFKit renderer (układ faktury PL: nagłówek, sprzedawca/nabywca, tabela pozycji, podsumowanie)
- [x] PDF zawsze z XML ze storage (xml2js parser → InvoiceData → PDFKit)
- [x] Dwa kody QR — weryfikacja KSeF + weryfikacja e-druczek (qrcode library)
- [x] Tryb RETRYING → GENERATED/FAILED — nie blokuje statusu ACCEPTED
- [x] Zapis PDF do Supabase Storage (`invoices/{documentId}.pdf`)
- [x] `generate-pdf` worker zaktualizowany (nie stub)
- [x] `PdfModule` dodany do `QueueModule`

**✅ Punkt kontrolny E7:** PDF generowany w pełnym pipeline E2E — xml2js + PDFKit + QR codes + upload do Storage. pdf_status=GENERATED, pdf_url=`invoices/{documentId}.pdf` ✓

---

## ETAP 8 — Offline24
*Cel: awaryjny tryb wysyłki z pełnym audytem*

- [ ] Certyfikat Typ 2 — upload i szyfrowanie w bazie
- [ ] `CertificateService`:
  - [ ] Sprawdzanie statusu CRL (cache 5 min)
  - [ ] Podpis cyfrowy XML w pamięci serwera
- [ ] Wyliczanie `offline24_deadline` (z uwzględnieniem dni wolnych)
- [ ] `offline24_attempt_log` — każda próba doręczenia logowana
- [ ] Proof of Delivery — log jako dowód dla US

**✅ Punkt kontrolny E8:** Faktura podpisana certyfikatem Typ 2, log prób doręczenia widoczny w bazie

---

## ETAP 9 — Faktury kosztowe (incoming)
*Cel: automatyczne pobieranie faktur od kontrahentów z KSeF*

- [ ] `KsefIncomingService` — pobieranie faktur z KSeF (direction: incoming)
- [ ] Parsowanie XML → zapis do documents
- [ ] UI — lista faktur kosztowych

**✅ Punkt kontrolny E9:** Faktury kosztowe widoczne w dashboardzie

---

## ETAP 10 — Migracja na certyfikat Typ 1 (2027)
*Cel: płynne przejście z tokenów na certyfikaty*

- [ ] Upload certyfikatu Typ 1
- [ ] Logika: jeśli cert_type1 istnieje → używaj go; token jako fallback do 31.12.2026
- [ ] UI — informacja o konieczności migracji (Q4 2026)

**✅ Punkt kontrolny E10:** System działa z certyfikatem Typ 1, token ignorowany

---

## Kolejność priorytetów (co najpierw)
```
E0 → E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8 → E9 → E10
```
Etapy E0-E5 to **backend-first** — bez nich UI nie ma sensu.  
Etapy E6-E7 można zacząć równolegle z E5.  
Etapy E8-E10 to drugorzędne — ważne, ale nie blokują MVP.

---

## MVP = E0 + E1 + E2 + E3 + E4 + E5 + E6 + E7
Czyli: można wystawić fakturę VAT lub ZW, wysłać do KSeF, pobrać numer KSeF, wygenerować PDF.
