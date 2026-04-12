# Brief dla Lovable — E-druczek Frontend

## O projekcie
System SaaS do wystawiania e-faktur KSeF dla jednoosobowych firm (JDG).
Backend (NestJS API) jest gotowy. Potrzebujemy frontend w **Next.js 16 + Tailwind CSS 4**.
Mobile-first — większość użytkowników to JDG korzystające z telefonu.

---

## Stack techniczny
- **Next.js 16** (App Router — folder `app/`, NIE `pages/`)
- **React 19**
- **Tailwind CSS 4**
- **TypeScript**
- Brak dodatkowych bibliotek UI (shadcn/ui dozwolony, ale nie wymagany)

---

## Ekrany do zbudowania

### 1. Logowanie / Rejestracja
- Prosty formularz email + hasło
- Przełącznik "Zaloguj się" / "Zarejestruj się"
- Pole "Kod zaproszenia" przy rejestracji (opcjonalne, placeholder)
- Design: minimalistyczny, logo na górze

### 2. Onboarding — Dane firmy (po pierwszym logowaniu)
Formularz:
- NIP (10 cyfr, walidacja formatu)
- Nazwa firmy
- Adres: ulica, numer, kod pocztowy, miasto
- Status VAT: radio/select z opcjami:
  - "Czynny podatnik VAT" 
  - "Zwolniony podmiotowo (art. 113)"
  - "Zwolniony przedmiotowo"
- Przycisk "Zapisz i przejdź dalej"

### 3. Dashboard główny
- **Nagłówek**: nazwa firmy, NIP, przycisk "Nowa faktura"
- **Tracker limitu**: pasek postępu X / 10 000 zł (miesięczny limit B2B bez KSeF)
- **Lista faktur** (tabela na desktop, karty na mobile):
  | Kolumna | Opis |
  |---------|------|
  | Numer | np. FV/2026/0001 |
  | Data | data wystawienia |
  | Nabywca | nazwa kontrahenta |
  | Kwota brutto | np. 1 230,00 zł |
  | Typ | B2B / B2C badge |
  | Status KSeF | badge z kolorem (patrz niżej) |
  | Akcje | Podgląd, Korekta |

- **Statusy KSeF** (badge z kolorem):
  - `DRAFT` — szary
  - `QUEUED` — żółty
  - `PROCESSING` — niebieski, animowany
  - `ACCEPTED` — zielony ✓
  - `REJECTED` — czerwony ✗
  - `SEND_FAILED` — czerwony
  - `PROCESSING_TIMEOUT` — pomarańczowy
  - `LOCAL_ONLY` — jasno szary "Tylko lokalnie"
- Sortowanie po dacie (najnowsze na górze)
- Pagination lub infinite scroll

### 4. Formularz nowej faktury
- **Typ faktury**: toggle B2B / B2C
- **Dane nabywcy**:
  - B2B: NIP + Nazwa + Adres
  - B2C: tylko Nazwa (NIP ukryty)
- **Numer faktury**: auto-generowany, edytowalny
- **Data wystawienia**: datepicker, domyślnie dzisiaj
- **Pozycje faktury** (dynamiczna lista):
  | Pole | Typ |
  |------|-----|
  | Nazwa usługi/towaru | tekst |
  | Ilość | liczba (do 4 miejsc) |
  | Jednostka | tekst (szt, godz, km...) |
  | Cena netto | kwota |
  | Stawka VAT | select: 23%, 8%, 5%, 0%, ZW, NP |
  | Wartość netto | auto (ilość × cena) |
  | VAT | auto |
  | Brutto | auto |
  - Przycisk "+ Dodaj pozycję"
  - Przycisk "✕ Usuń" przy każdej pozycji
- **Jeśli stawka = ZW**: pokaż pole "Podstawa prawna zwolnienia" (tekst)
- **Podsumowanie** na dole:
  - Razem netto
  - Razem VAT
  - **Razem brutto** (wyróżnione)
- **Przyciski**:
  - "Zapisz jako szkic" (DRAFT)
  - "Wyślij do KSeF" (submit → QUEUED)

### 5. Formularz faktury korygującej
- Wybór faktury do korekty (dropdown z listy ACCEPTED)
- Wyświetl dane faktury oryginalnej (numer, data, kwota)
- Checkbox: "Faktura oryginalna była w KSeF?" (jeśli tak — pokaż numer KSeF)
- Pozycje korekty — model delta:
  - Każda pozycja to **różnica** (np. -10,00 zł netto)
  - Ujemne wartości dozwolone
- Pole "Przyczyna korekty" (wymagane)
- Przyciski: "Zapisz" / "Wyślij do KSeF"

### 6. Podgląd faktury
- Dane faktury (numer, data, sprzedawca, nabywca, pozycje, kwoty)
- **Status KSeF** — duży badge z kolorem
- **Numer KSeF** — jeśli ACCEPTED (np. `5260250274-20260412-...`)
- Przycisk "Pobierz PDF" (disabled jeśli PDF nie gotowy)
- Przycisk "Wystaw korektę"
- Timeline statusów: DRAFT → QUEUED → PROCESSING → ACCEPTED (z timestampami)

---

## Nawigacja
- **Sidebar** (desktop) / **Bottom nav** (mobile):
  - Dashboard (lista faktur)
  - Nowa faktura
  - Ustawienia firmy
  - Wyloguj

---

## Design guidelines
- Kolor główny: niebieski (#2563EB lub podobny)
- Tło: jasne (white/gray-50)
- Font: system font stack
- Zaokrąglone rogi (rounded-lg)
- Cienie: shadow-sm na kartach
- Responsywne: mobile-first, breakpoint md: (768px) na desktop
- Polskie etykiety wszędzie (Faktura, Nabywca, Kwota brutto...)

---

## Struktura plików (App Router)
```
app/
  layout.tsx          — główny layout z nawigacją
  page.tsx            — redirect do /dashboard
  login/
    page.tsx          — logowanie / rejestracja
  onboarding/
    page.tsx          — formularz firmy
  dashboard/
    page.tsx          — lista faktur + tracker limitu
  invoices/
    new/
      page.tsx        — formularz nowej faktury
    [id]/
      page.tsx        — podgląd faktury
    [id]/correct/
      page.tsx        — formularz korekty
  settings/
    page.tsx          — ustawienia firmy
components/
  InvoiceForm.tsx     — formularz faktury (reużywalny)
  InvoiceLineItem.tsx — wiersz pozycji faktury
  StatusBadge.tsx     — badge statusu KSeF
  LimitTracker.tsx    — pasek limitu 10k
  Navbar.tsx          — nawigacja sidebar/bottom
```

---

## Czym NIE musisz się zajmować (zrobimy sami)
- ❌ Integracja z Supabase Auth (JWT, session)
- ❌ Fetch do backend API (endpoints, authorization headers)
- ❌ Real-time statusy SSE
- ❌ Import typów z `@e-druczek/shared`
- ❌ Walidacja biznesowa (limit 10k, B2C→B2B blokada)
- ❌ Generowanie PDF

Skup się na **UI, layout, komponenty, formularze, nawigacja**.
Dane mogą być mockowane (hardcoded lub z pliku `mock-data.ts`).

---

## Mock data (użyj do wyświetlania)
```typescript
// mock-data.ts
export const mockCompany = {
  id: '1',
  nip: '5260250274',
  name: 'Testowa JDG Krystian',
  vat_status: 'VAT_ACTIVE',
};

export const mockInvoices = [
  {
    id: '1',
    invoice_number: 'FV/2026/0001',
    issue_date: '2026-04-12',
    buyer_name: 'Kontrahent Sp. z o.o.',
    amount_gross: 1230.00,
    invoice_target: 'B2B',
    ksef_status: 'ACCEPTED',
    ksef_reference_number: '5260250274-20260412-74E844800000-86',
  },
  {
    id: '2',
    invoice_number: 'FV/2026/0002',
    issue_date: '2026-04-12',
    buyer_name: 'Jan Kowalski',
    amount_gross: 500.00,
    invoice_target: 'B2C',
    ksef_status: 'LOCAL_ONLY',
    ksef_reference_number: null,
  },
  {
    id: '3',
    invoice_number: 'FV/2026/0003',
    issue_date: '2026-04-11',
    buyer_name: 'ABC Usługi Sp. z o.o.',
    amount_gross: 615.00,
    invoice_target: 'B2B',
    ksef_status: 'PROCESSING',
    ksef_reference_number: null,
  },
];
```
