# E-druczek — KSeF SaaS MVP dla JDG

System do wystawiania faktur zgodnych z KSeF 2.0 / FA(3) dla jednoosobowych działalności gospodarczych (VAT i ZW).

> **Obowiązek KSeF od 1 kwietnia 2026 (JDG)**

## Struktura projektu

```
apps/
  web/        # Frontend — Next.js 16, TypeScript, Tailwind CSS
  api/        # Backend — NestJS 10, BullMQ, Redis
packages/
  shared/     # Wspólne typy TypeScript i enumy
supabase/
  migrations/ # Schemat bazy danych PostgreSQL
```

## Wymagania

- Node.js >= 20
- npm >= 10
- Redis (lokalnie lub Docker)
- Konto Supabase

## Pierwsze uruchomienie

```bash
# 1. Sklonuj repo
git clone https://github.com/GT7Krystian/E-druczek.git
cd E-druczek

# 2. Zainstaluj zależności (wszystkie workspace'y)
npm install

# 3. Zbuduj pakiet shared
npm run build:shared

# 4. Skonfiguruj zmienne środowiskowe
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Uzupełnij wartości w obu plikach .env

# 5. Uruchom bazę danych
# Wejdź na supabase.com, stwórz projekt, uruchom migracje z supabase/migrations/
# w kolejności: 001 → 002 → 003

# 6. Uruchom Redis
docker run -d -p 6379:6379 redis:alpine
# lub lokalnie jeśli masz zainstalowany Redis

# 7. Uruchom serwery deweloperskie
npm run dev:web   # http://localhost:3000
npm run dev:api   # http://localhost:3001/api
```

## Migracje Supabase

Uruchom w SQL Editor na supabase.com w kolejności:

| Plik | Zawartość |
|------|-----------|
| `supabase/migrations/001_init_users_companies.sql` | Tabele: users, companies, company_ksef_connections |
| `supabase/migrations/002_documents.sql` | Tabele: documents, document_items + trigger Data Freeze |
| `supabase/migrations/003_monitoring_dlq.sql` | Tabela: failed_jobs, widoki SLA, funkcja limitu 10k |

## Dokumentacja

- [Architektura systemu](./Dokumentacja%20Architektury%20KSeF%20dla%20JDG.md)
- [Plan implementacji](./PLAN.md)
