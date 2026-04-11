# **KSeF SaaS MVP \- Dokumentacja Architektury Systemu**

**Wersja Uniwersalna dla JDG (VAT i ZW) — v5.1 (Production Ready)**

* **Status:** MVP — Gotowy do implementacji  
* **Dotyczy API:** KSeF 2.0 / FA(3)  
* **Obowiązek KSeF od:** 1 kwietnia 2026 (JDG)

## **1\. Cel systemu**

System stanowi ultra-prostą nakładkę UX na API KSeF 2.0, dostosowującą się do profilu podatkowego użytkownika (VAT czynny lub zwolniony). Kluczowe funkcje:

* Wystawienie **Faktury VAT** oraz **Faktury zwolnionej z VAT (ZW)** z obsługą węzłów P\_19A/B/C per pozycja.  
* Odrębna ścieżka dla faktur konsumenckich **B2C** — generowanie lokalnego PDF poza obowiązkiem KSeF.  
* **Śledzenie limitu 10 000 zł** (do końca 2026 r.) z atomicznym sprawdzeniem przed zapisem faktury.  
* **Faktury Korygujące** w modelu delta — jedyna legalna forma korekty po nadaniu numeru KSeF.  
* Tryb **Offline24** oparty o certyfikat wystawcy (Typ 2\) przypisany do NIP użytkownika, z pełnym audytem prób doręczenia.  
* Automatyczne pobieranie faktur kosztowych z KSeF.  
* **Pipeline przetwarzania** XML → walidacja → KSeF → PDF z gwarancją niezmienności danych (Data Freeze) i obsługą Dead Letter Queue.  
* Łagodna migracja z Tokenów KSeF na Certyfikaty (wymóg od 1 stycznia 2027 r.).

## **2\. Grupa docelowa i założenia biznesowe**

* **Profil:** Jednoosobowa Działalność Gospodarcza (JDG) — czynni podatnicy VAT oraz zwolnieni (podmiotowo i przedmiotowo).  
* **Wolumen:** kilka–ok. 50 dokumentów miesięcznie.  
* **Wiedza techniczna i prawna:** niska. Użytkownik nie musi znać struktury FA(3), przepisów o NrKSeF vs NrKSeFN ani zasad certyfikatów.  
* **Filozofia:** "Jeden system, dynamiczne formularze" — kształt dokumentu i ścieżka wysyłki determinowane są statusem VAT i typem nabywcy.  
* **Dystrybucja:** zamknięta beta z kodem zaproszenia (np. XyZ123) — umożliwia kontrolowane onboardowanie i zbieranie feedbacku przed publicznym startem.

## **3\. Architektura systemu**

System oparty jest na event-driven backendzie Node.js wspartym zewnętrznym systemem kolejek (Redis/BullMQ). Architektura zapewnia Fault Tolerance, idempotencję i skalowalność przy minimalizacji narzutu DevOps.

### **3.1 Warstwy systemu**

**Frontend (React / Lovable — Mobile-first)**

* **Dynamiczny formularz VAT:** pokazuje stawki VAT (23%, 8%, 5%, 0%) lub pola podstawy prawnej zwolnienia per pozycja — zależnie od vat\_status firmy.  
* **Logika B2B/B2C:** przełącznik typu nabywcy. B2C dezaktywuje wysyłkę do KSeF i generuje lokalny PDF.  
* **Tracker limitu 10k:** wyświetla bieżącą sumę B2B i ostrzega o zbliżaniu się do progu.  
* **Obsługa korekt:** formularz wymagający wskazania faktury pierwotnej i wprowadzenia różnic (model delta). Pyta użytkownika czy dokument pierwotny był w KSeF — determinuje użycie NrKSeF vs NrKSeFN.  
* **Real-time statusy:** SSE/long-polling do nasłuchiwania zmian ksef\_status (QUEUED → PROCESSING → ACCEPTED).

**Backend (Node.js/NestJS \+ Supabase \+ Redis/BullMQ)**

* **Pipeline XML:** generate\_xml → validate\_xsd → send\_to\_ksef → check\_status\_upo → generate\_pdf — każdy krok jako osobne zadanie w kolejce z możliwością wznawiania od konkretnego etapu.  
* **Bezpieczeństwo kolejek (BullMQ):** Zadania posiadają jednoznaczny jobId (document\_id \+ step), ustawione removeOnComplete: true oraz concurrency: 1 dla kroków wysyłkowych, co eliminuje wyścigi procesów (Race Conditions).  
* **Zamrożenie danych (Data Freeze):** Gdy faktura wchodzi w status \>= QUEUED, rekord w bazie staje się całkowicie niemutowalny dla użytkownika. XML generowany jest ze zrobionego w tym momencie snapshota. Zapobiega to rozjazdowi między tym co w KSeF, a tym co w bazie.  
* **Idempotencja i Deduplikacja KSeF:** Idempotencja własnych workerów to za mało. Przed wykonaniem *retry* wysyłki, backend odpytuje KSeF o faktury z danego dnia dla danego NIP/kwoty, aby upewnić się, czy KSeF nie przyjął pliku mimo wcześniejszego timeoutu. Jeśli przyjęto \- system parsuje odpowiedź (mapuje NrKSeF) zamiast wysyłać ponownie.  
* **XML jako source of truth:** PDF generowany zawsze z XML pobranego ze storage (po ACCEPTED), nigdy z danych bazy.  
* **Mutex sesji KSeF:** wyłącznie Redis (key: ksef:lock:{company\_id}) z TTL.

## **4\. Model danych**

### **4.1 users & companies**

**Tabela: users**

|

| **Pole** | **Typ** | **Opis / Uwagi** |

| id | UUID | Klucz główny |

| email | VARCHAR | Login użytkownika |

| created\_at | TIMESTAMP | Data rejestracji |

| role | ENUM | admin / user |

**Tabela: companies**

| **Pole** | **Typ** | **Opis / Uwagi** |

| id | UUID | Klucz główny |

| user\_id | UUID FK | Właściciel firmy |

| nip | VARCHAR(10) | NIP podatnika |

| name | VARCHAR | Nazwa firmy |

| vat\_status | ENUM | VAT\_ACTIVE / VAT\_EXEMPT\_SUBJECTIVE / VAT\_EXEMPT\_OBJECTIVE |

| monthly\_b2b\_total | DECIMAL | Bieżąca suma B2B w miesiącu — do śledzenia progu 10k |

**Tabela: company\_ksef\_connections**

| **Pole** | **Typ** | **Opis / Uwagi** |

| id | UUID | Klucz główny |

| company\_id | UUID FK | Powiązana firma |

| ksef\_token\_encrypted | TEXT | Token KSeF (ważny do 31.12.2026) |

| ksef\_cert\_type1\_encrypted | TEXT | Certyfikat Typ 1 — online od 2027 |

| ksef\_cert\_type2\_encrypted | TEXT | Certyfikat Typ 2 — podpisywanie offline24 |

| cert\_type2\_expires\_at | TIMESTAMP | Data wygaśnięcia |

| cert\_type2\_status\_cache | ENUM | VALID / REVOKED / UNKNOWN |

### **4.2 documents (Nagłówek faktury)**

**Tabela: documents**

| **Pole** | **Typ** | **Opis / Uwagi** |

| id | UUID | Klucz główny |

| company\_id | UUID FK | Wystawca |

| direction | ENUM | incoming / outgoing |

| invoice\_target | ENUM | B2B / B2C |

| document\_class | ENUM | FAKTURA\_PIERWOTNA / FAKTURA\_KORYGUJACA |

| original\_ksef\_reference\_number | VARCHAR | Numer KSeF faktury pierwotnej |

| original\_was\_in\_ksef | BOOLEAN | True → użyj NrKSeF; False → użyj NrKSeFN=1 |

| amount\_gross | DECIMAL | Kwota brutto |

| ksef\_status | ENUM | LOCAL\_ONLY / DRAFT / QUEUED / PROCESSING / PROCESSING\_TIMEOUT / ACCEPTED / REJECTED / OFFLINE24\_PENDING / SEND\_FAILED |

| ksef\_reference\_number | VARCHAR | Nadany numer KSeF |

| upo\_number | VARCHAR | Numer UPO |

| xml\_hash | VARCHAR | SHA-256 pliku XML |

| xml\_schema\_version | VARCHAR | Np. FA(3) \- do śledzenia wersji generatora |

| xml\_generator\_version | VARCHAR | Wewnętrzna wersja kodu generatora (przydatne przy migracjach) |

| idempotency\_key | VARCHAR | SHA256(xml\_content \+ company\_id) |

| offline24\_deadline | TIMESTAMP | Koniec następnego dnia roboczego |

| offline24\_attempt\_log | JSONB | "Proof of delivery": rejestr prób wysyłki (timestamp, kod błędu, timeout) |

| pdf\_status | ENUM | PENDING / GENERATED / FAILED / RETRYING \- własny cykl życia PDF |

| pdf\_generated\_from\_xml | BOOLEAN | Zawsze True jeśli PDF istnieje |

| qr\_version | VARCHAR | Wersja algorytmu QR MF |

| retry\_count | INTEGER | Liczba prób wysyłki |

| xml\_url | VARCHAR | URL do pliku XML w storage |

| pdf\_url | VARCHAR | URL do pliku PDF w storage |

### **4.3 document\_items (Pozycje faktury)**

**Tabela: document\_items**

| **Pole** | **Typ** | **Opis / Uwagi** |

| id | UUID | Klucz główny |

| document\_id | UUID FK | Faktura nadrzędna |

| name | VARCHAR(512) | Nazwa towaru/usługi (FA3: max 512 znaków) |

| quantity | DECIMAL | Ilość |

| unit | VARCHAR | Jednostka miary |

| unit\_price\_net | DECIMAL | Cena jednostkowa netto |

| vat\_rate | ENUM | 23 / 8 / 5 / 0 / zw / np |

| total\_net | DECIMAL | Wartość netto pozycji |

| total\_vat | DECIMAL | Wartość VAT pozycji |

| total\_gross | DECIMAL | Wartość brutto pozycji |

| vat\_exemption\_node | ENUM | P\_19A / P\_19B / P\_19C — per pozycja (dokument może mieć różne podstawy) |

| vat\_exemption\_text | TEXT | Tekst podstawy prawnej (max 256 znaków, art. 43 / art. 113 itp.) |

| is\_delta\_correction | BOOLEAN | True \= pozycja korygująca (wartości jako różnica, nie nowa kwota) |

## **5\. Przepływy i kolejki (BullMQ)**

### **5.1 Pipeline wysyłki do KSeF**

generate\_xml   
  → validate\_xsd          (Zamrożenie danych w DB, walidacja XSD)  
    → send\_to\_ksef        (Deduplikacja KSeF → Mutex → InitToken → Send → Terminate)  
      → check\_status\_upo  (Polling z Timeoutem: max 15 min życia)  
        → generate\_pdf    (Zależna kolejka z własnym fallbackiem)

* **Deduplikacja a Idempotencja:** Przed ślepym wykonaniem operacji *Retry* (np. po 504 Gateway Timeout), worker pyta KSeF o listę faktur z dzisiaj (po kwocie i kontrahencie). Jeśli zlokalizuje wysłany dokument (MF przyjęło XML, ale nie zdążyło odpowiedzieć), przejmuje nadany mu wewnętrzny numer i omija dublowaną wysyłkę.  
* **Polling UPO Timeout:** KSeF potrafi zawiesić się na wiele godzin bez zmiany statusu. Kolejka check\_status\_upo posiada bezwzględny limit życia procesu (np. max\_poll\_time \= 15 minut). Po jego upływie faktura otrzymuje status PROCESSING\_TIMEOUT i trafia do DLQ w celu weryfikacji manualnej lub automatycznego wznowienia po ustabilizowaniu się platformy rządowej.  
* **PDF Pipeline Fallback:** PDF nie jest blokerem biznesowym. Jeśli oficjalny arkusz XSLT od MF lub parser padnie, dokument pozostaje jako ACCEPTED, a PDF przechodzi w tryb RETRYING. Można go wygenerować asynchronicznie później, nie blokując operacji księgowych.

### **5.2 Flow śledzenia limitu 10 000 zł**

BEGIN TRANSACTION;  
  SELECT SUM(amount\_gross) FROM documents  
  WHERE company\_id \= :id  
    AND invoice\_target \= 'B2B'  
    AND direction \= 'outgoing'  
    AND issue\_date \>= first\_day\_of\_month()  
    AND ksef\_status \!= 'REJECTED'  
  FOR UPDATE;   \-- blokada optymistyczna (zapobiega Race Condition)  
  \-- \[...\]  
COMMIT;

### **5.3 Tryb Offline24 (Pełny Audyt Doręczeń)**

Tryb awaryjny nie chroni przed karą skarbową, jeśli nie udowodnimy, że urządzenie działało prawidłowo.

1. offline24\_deadline wyliczany z uwzględnieniem dni wolnych.  
2. **Krytyczny Cache Certyfikatu:** System sprawdza cert\_type2\_status\_cache. Ponieważ 1h to zbyt długo na operacje kryptograficzne (certyfikat mógł zostać odwołany), jeśli od ostatniego sprawdzenia minęło **więcej niż 5 minut**, system wymusza natychmiastowe odświeżenie statusu CRL z API MF przed złożeniem podpisu.  
3. Podpis cyfrowy certyfikatem użytkownika (Typ 2\) w pamięci serwera.  
4. Generowanie PDF z dwoma kodami QR.  
5. Worker invoice-offline-sync próbuje dostarczyć plik.  
6. **Proof of Delivery:** Każda porażka (5xx, Timeout) jest skrupulatnie dopisywana do pola offline24\_attempt\_log. Gdy minie deadline, log ten jest niezaprzeczalnym dowodem dla US, że podatnik dopełnił starań w ramach SLA systemu KSeF.

### **5.4 Faktury Korygujące**

* **Model Delta:** Wartości korygujące to różnica, nie nowa kwota.  
* **Blokada B2C \-\> B2B:** System *bezwzględnie blokuje* próbę skorygowania lokalnej faktury konsumenckiej (B2C) z zamiarem dopisania do niej NIP-u i wysłania jako B2B do KSeF. MF tego nie akceptuje. Procedura wymusza anulowanie paragonu/faktury lokalnej i wystawienie nowej faktury pierwotnej B2B od zera.  
* **Rozstrzygnięcie NrKSeF vs NrKSeFN:** Używane jest zawsze tylko jedno pole (wymuszone twardą walidacją backendu, aby uniknąć HTTP 400 z KSeF).

## **6\. Monitorowanie, SLA i DLQ**

### **6.1 Dead Letter Queue (DLQ)**

Wszystkie błędy po wyczerpaniu limitu retry lub przekroczeniu max\_poll\_time lądują w tabeli failed\_jobs.

### **6.2 Monitorowanie SLA (Krytyczne Alerty)**

System w trybie ciągłym (CRON co 1 minutę) skanuje tabelę documents pod kątem zamrożonych procesów KSeF:

* **Alert QUEUED\_STUCK:** Status QUEUED utrzymuje się \> 5 minut (oznacza, że padły nasze workery lub Redis).  
* **Alert PROCESSING\_STUCK:** Status PROCESSING utrzymuje się \> 10 minut (oznacza problem po stronie Ministerstwa Finansów).  
* **Alert OFFLINE\_CRITICAL:** Faktura ma status OFFLINE24\_PENDING na 2 godziny przed wygaśnięciem offline24\_deadline. Wyzwala to PagerDuty/SMS do dyżurnego admina, aby zapobiec karze dla podatnika.

### **6.3 Klasyfikacja błędów KSeF**

* **5xx / timeout / 429 rate limit:** Retry (max 5, backoff) \+ deduplikacja.  
* **Błąd biznesowy XML:** Natychmiastowy REJECTED.  
* **Przekroczony retry\_count / timeout:** DLQ (invoice\_failed).

## **7\. Onboarding, tokeny i migracja 2027**

1. **Beta:** Rejestracja z kodem zaproszenia (XyZ123).  
2. **Token KSeF:** (ważny do 31.12.2026).  
3. **Certyfikat Typ 2:** Niezbędna "Tarcza awaryjna" (Offline24).  
4. **Migracja 2027:** Od momentu wgrania certyfikatu Typ 1 (Q4 2026), system przechodzi na niego jako główną metodę uwierzytelniania, traktując Token KSeF jako formę fallback jedynie do 31.12.2026.

## **8\. Podsumowanie**

Architektura systemu opiera się na wyraźnym rozdzieleniu warstwy prezentacji od warstwy integracji opartej o system kolejkowy z pełną idempotencją. Wersja 5.1 wprowadza twarde mechanizmy obronne (Data Freeze, Deduplikacja żądań do KSeF, Audyt prób doręczenia dla Offline24, Ścisłe rygory SLA timeoutów), co uniezależnia stabilność platformy SaaS od chimerycznej natury systemów państwowych. System jest gotowy do udźwignięcia odpowiedzialności prawnej za dokumenty JDG w latach 2026-2027.