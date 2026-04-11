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
- [ ] Restrukturyzacja monorepo:
  - [ ] `apps/web/` — przeniesienie obecnego Next.js
  - [ ] `apps/api/` — scaffold NestJS
  - [ ] `packages/shared/` — folder na wspólne typy
  - [ ] `supabase/migrations/` — folder na migracje SQL
- [ ] Aktualizacja `CLAUDE.md` z nową strukturą
- [ ] Aktualizacja `AGENTS.md` z nową strukturą
- [ ] Plik `.env.example` dla `apps/api` i `apps/web`
- [ ] `README.md` z instrukcją uruchomienia projektu

**✅ Punkt kontrolny E0:** `git clone` + `npm install` działa bez błędów

---

## ETAP 1 — Baza danych (Supabase)
*Cel: działający schemat bazy z RLS, gotowy do przyjęcia danych*

- [ ] Założenie projektu Supabase (region: Frankfurt)
- [ ] Uruchomienie migracji:
  - [ ] `001_users_and_companies.sql` — users, companies, ksef_connections
  - [ ] `002_documents.sql` — documents, document_items, failed_jobs
  - [ ] `003_functions_and_views.sql` — SLA views, funkcja limitu 10k
- [ ] Weryfikacja triggerów (Data Freeze, updated_at, queued_at)
- [ ] Weryfikacja RLS — użytkownik widzi tylko swoje dane
- [ ] Supabase Auth — konfiguracja (email/password na start)
- [ ] Zmienne środowiskowe w `.env` (lokalnie, nigdy w repo)

**✅ Punkt kontrolny E1:** Można założyć usera, firmę i dokument przez SQL Editor

---

## ETAP 2 — Backend NestJS — szkielet
*Cel: działające API z połączeniem do Supabase i Redis*

- [ ] Inicjalizacja projektu NestJS w `apps/api`
- [ ] Moduły bazowe:
  - [ ] `AuthModule` — JWT + Supabase Auth
  - [ ] `CompaniesModule` — CRUD firm
  - [ ] `DocumentsModule` — CRUD dokumentów (bez KSeF na razie)
- [ ] Połączenie z Supabase (service role key)
- [ ] Połączenie z Redis (BullMQ)
- [ ] Współdzielone typy w `packages/shared` (enums, DTO)
- [ ] Walidacja DTO (class-validator)
- [ ] Globalny error handler

**✅ Punkt kontrolny E2:** `POST /companies` i `POST /documents` działają, dane lądują w Supabase

---

## ETAP 3 — Generator XML FA(3)
*Cel: generowanie poprawnego XML zgodnego ze schematem KSeF 2.0*

- [ ] Pobranie schematu XSD FA(3) z MF
- [ ] `XmlGeneratorService` — generowanie XML z danych dokumentu:
  - [ ] Faktura VAT (stawki 23%, 8%, 5%, 0%)
  - [ ] Faktura ZW (węzły P_19A / P_19B / P_19C per pozycja)
  - [ ] Faktura korygująca (model delta, NrKSeF vs NrKSeFN)
- [ ] `XsdValidatorService` — walidacja wygenerowanego XML
- [ ] Testy jednostkowe generatora (przynajmniej 3 scenariusze)
- [ ] Zapis XML do Supabase Storage

**✅ Punkt kontrolny E3:** Wygenerowany XML przechodzi walidację XSD bez błędów

---

## ETAP 4 — Integracja KSeF (środowisko demo)
*Cel: wysłać pierwszą fakturę do demo.ksef.gov.pl i odebrać numer KSeF*

- [ ] Rejestracja na demo.ksef.gov.pl (NIP testowy)
- [ ] `KsefSessionService`:
  - [ ] Inicjalizacja sesji tokenem
  - [ ] Mutex Redis (`ksef:lock:{company_id}`)
  - [ ] Zamknięcie sesji (Terminate)
- [ ] `KsefSendService`:
  - [ ] Wysyłka XML
  - [ ] Deduplikacja przed retry (sprawdzenie czy KSeF już przyjął)
- [ ] `KsefStatusService`:
  - [ ] Polling UPO (max 15 min, timeout → PROCESSING_TIMEOUT)
  - [ ] Mapowanie statusów KSeF → wewnętrzne statusy
- [ ] Obsługa błędów:
  - [ ] 5xx / timeout → retry z backoff (max 5)
  - [ ] Błąd biznesowy XML → REJECTED natychmiast
  - [ ] Wyczerpany retry → DLQ (failed_jobs)

**✅ Punkt kontrolny E4:** Faktura VAT wysłana do demo KSeF, odebrany numer KSeF, status ACCEPTED w bazie

---

## ETAP 5 — Pipeline kolejek BullMQ
*Cel: niezawodny, idempotentny pipeline wysyłki*

- [ ] Konfiguracja BullMQ + Redis
- [ ] Kolejki i workery:
  - [ ] `generate-xml` worker
  - [ ] `validate-xsd` worker + Data Freeze w DB
  - [ ] `send-to-ksef` worker (concurrency: 1)
  - [ ] `check-status-upo` worker (polling z timeoutem)
  - [ ] `generate-pdf` worker (nie blokuje, własny fallback)
  - [ ] `invoice-offline-sync` worker (Offline24)
- [ ] Dead Letter Queue — obsługa `failed_jobs`
- [ ] CRON monitoring SLA (co 1 min):
  - [ ] Alert QUEUED_STUCK (> 5 min)
  - [ ] Alert PROCESSING_STUCK (> 10 min)
  - [ ] Alert OFFLINE_CRITICAL (< 2h do deadline)

**✅ Punkt kontrolny E5:** Faktura przechodzi przez cały pipeline automatycznie, widać statusy w bazie

---

## ETAP 6 — Frontend Next.js
*Cel: działający interfejs użytkownika, mobile-first*

- [ ] Supabase Auth UI — logowanie / rejestracja z kodem zaproszenia
- [ ] Onboarding — formularz danych firmy (NIP, nazwa, status VAT)
- [ ] Dashboard główny:
  - [ ] Lista faktur z statusami KSeF (real-time SSE)
  - [ ] Tracker limitu 10 000 zł
- [ ] Formularz wystawiania faktury:
  - [ ] Dynamiczny (VAT_ACTIVE → stawki VAT, VAT_EXEMPT → podstawa prawna)
  - [ ] Przełącznik B2B / B2C
  - [ ] Pozycje faktury (dodawanie, usuwanie)
  - [ ] Walidacja po stronie klienta
- [ ] Formularz faktury korygującej:
  - [ ] Wskazanie faktury pierwotnej
  - [ ] Model delta (różnica, nie nowa kwota)
  - [ ] Pytanie: czy dokument pierwotny był w KSeF?
- [ ] Widok faktury — podgląd PDF, status KSeF, numer KSeF
- [ ] Real-time statusy (SSE / long-polling: QUEUED → PROCESSING → ACCEPTED)

**✅ Punkt kontrolny E6:** Można wystawić fakturę VAT B2B przez UI i zobaczyć ją jako ACCEPTED

---

## ETAP 7 — Generowanie PDF
*Cel: PDF z kodem QR zgodny z wymogami MF*

- [ ] `PdfGeneratorService` — generowanie PDF z XML (XSLT MF lub własny renderer)
- [ ] PDF zawsze z XML ze storage (nigdy z danych bazy)
- [ ] Dwa kody QR dla Offline24 (wersja algorytmu MF)
- [ ] Tryb RETRYING — PDF nie blokuje statusu ACCEPTED
- [ ] Zapis PDF do Supabase Storage

**✅ Punkt kontrolny E7:** PDF pobieralny dla faktury ACCEPTED, zgodny wizualnie z wymogami MF

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
