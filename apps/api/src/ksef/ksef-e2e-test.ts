/**
 * E2E test script for KSeF ETAP 4.
 * Run: npx ts-node src/ksef/ksef-e2e-test.ts
 *
 * Tests the full flow:
 * 1. Fetch public key
 * 2. Challenge → auth → token redeem
 * 3. Open session (AES key)
 * 4. Generate XML → encrypt → send
 * 5. Close session → poll UPO → get ksefNumber
 */

import 'dotenv/config';
import {
  createPublicKey,
  publicEncrypt,
  randomBytes,
  createCipheriv,
  createHash,
  constants,
} from 'crypto';
import { DocumentClass, VatRate } from '@e-druczek/shared';

const BASE_URL = process.env.KSEF_API_URL!;
const NIP = process.env.KSEF_NIP!;
const KSEF_TOKEN = process.env.KSEF_TOKEN!;

async function api(
  method: string,
  path: string,
  body?: unknown,
  bearer?: string,
): Promise<any> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (bearer) headers['Authorization'] = `Bearer ${bearer}`;

  const url = `${BASE_URL}${path}`;
  console.log(`→ ${method} ${path}`);

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${res.status}: ${text.slice(0, 500)}`);
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }

  console.log(`✓ ${res.status}`);
  return text ? JSON.parse(text) : null;
}

function sha256b64(data: Buffer): string {
  return createHash('sha256').update(data).digest('base64');
}

async function main() {
  console.log(`\n=== KSeF E2E Test ===`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`NIP: ${NIP}\n`);

  // ─── 1. Public key ──────────────────────────────────────
  console.log('--- 1. Fetching public key ---');
  const certs = await api('GET', '/security/public-key-certificates');
  const now = new Date();
  const tokenCert = certs.find(
    (c: any) =>
      new Date(c.validFrom) <= now &&
      new Date(c.validTo) >= now &&
      c.usage.includes('KsefTokenEncryption'),
  );
  const symCert = certs.find(
    (c: any) =>
      new Date(c.validFrom) <= now &&
      new Date(c.validTo) >= now &&
      c.usage.includes('SymmetricKeyEncryption'),
  );
  if (!tokenCert || !symCert) throw new Error('Missing required certs');
  console.log(`  Token cert valid until: ${tokenCert.validTo}`);
  console.log(`  Symmetric cert valid until: ${symCert.validTo}`);

  const tokenPubKey = createPublicKey(
    `-----BEGIN CERTIFICATE-----\n${tokenCert.certificate}\n-----END CERTIFICATE-----`,
  );
  const symPubKey = createPublicKey(
    `-----BEGIN CERTIFICATE-----\n${symCert.certificate}\n-----END CERTIFICATE-----`,
  );

  // ─── 2. Challenge + Auth ────────────────────────────────
  console.log('\n--- 2. Challenge + Auth ---');
  const challenge = await api('POST', '/auth/challenge', {});
  console.log(`  Challenge: ${challenge.challenge}`);
  console.log(`  TimestampMs: ${challenge.timestampMs}`);

  const tokenPlain = Buffer.from(
    `${KSEF_TOKEN}|${challenge.timestampMs}`,
    'utf-8',
  );
  const encryptedToken = publicEncrypt(
    { key: tokenPubKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    tokenPlain,
  ).toString('base64');

  const authResult = await api('POST', '/auth/ksef-token', {
    challenge: challenge.challenge,
    contextIdentifier: { type: 'Nip', value: NIP },
    encryptedToken,
  });
  const opToken = authResult.authenticationToken.token;
  const authRefNr = authResult.referenceNumber;
  console.log(`  Auth ref: ${authRefNr}`);

  // ─── 3. Poll auth status ───────────────────────────────
  console.log('\n--- 3. Polling auth status ---');
  for (let i = 0; i < 30; i++) {
    const status = await api('GET', `/auth/${authRefNr}`, undefined, opToken);
    console.log(`  Status: ${status.status.code} — ${status.status.description}`);
    if (status.status.code === 200) break;
    if (status.status.code >= 400) throw new Error('Auth failed');
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ─── 4. Redeem tokens ──────────────────────────────────
  console.log('\n--- 4. Redeem tokens ---');
  const tokens = await api('POST', '/auth/token/redeem', {}, opToken);
  const accessToken = tokens.accessToken.token;
  console.log(`  Access token valid until: ${tokens.accessToken.validUntil}`);

  // ─── 5. Open session ───────────────────────────────────
  console.log('\n--- 5. Open session ---');
  const aesKey = randomBytes(32);
  const iv = randomBytes(16);
  const encSymKey = publicEncrypt(
    { key: symPubKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    aesKey,
  ).toString('base64');

  const session = await api('POST', '/sessions/online', {
    formCode: {
      systemCode: 'FA (3)',
      schemaVersion: '1-0E',
      value: 'FA',
    },
    encryption: {
      encryptedSymmetricKey: encSymKey,
      initializationVector: iv.toString('base64'),
    },
  }, accessToken);
  const sessionRef = session.referenceNumber;
  console.log(`  Session: ${sessionRef}`);

  // ─── 6. Generate & send invoice ────────────────────────
  console.log('\n--- 6. Send invoice ---');

  // Inline minimal FA(3) XML
  const invoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek>
    <KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>
    <SystemInfo>e-druczek-test</SystemInfo>
  </Naglowek>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${NIP}</NIP>
      <Nazwa>Testowa JDG E-Druczek</Nazwa>
    </DaneIdentyfikacyjne>
    <Adres>
      <KodKraju>PL</KodKraju>
      <AdresL1>ul. Testowa 1</AdresL1>
    </Adres>
  </Podmiot1>
  <Podmiot2>
    <DaneIdentyfikacyjne>
      <NIP>1234567890</NIP>
      <Nazwa>Kontrahent Test Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
    <JST>2</JST>
    <GV>2</GV>
  </Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-04-12</P_1>
    <P_2>FV/TEST/E4/0001</P_2>
    <P_13_1>100.00</P_13_1>
    <P_14_1>23.00</P_14_1>
    <P_15>123.00</P_15>
    <Adnotacje>
      <P_16>2</P_16>
      <P_17>2</P_17>
      <P_18>2</P_18>
      <P_18A>2</P_18A>
      <Zwolnienie>
        <P_19N>1</P_19N>
      </Zwolnienie>
      <NoweSrodkiTransportu>
        <P_22N>1</P_22N>
      </NoweSrodkiTransportu>
      <P_23>2</P_23>
      <PMarzy>
        <P_PMarzyN>1</P_PMarzyN>
      </PMarzy>
    </Adnotacje>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz>
      <NrWierszaFa>1</NrWierszaFa>
      <P_7>Usluga testowa ETAP4</P_7>
      <P_8A>szt</P_8A>
      <P_8B>1</P_8B>
      <P_9A>100.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`;

  const plainBuf = Buffer.from(invoiceXml, 'utf-8');
  const invoiceHash = sha256b64(plainBuf);
  const invoiceSize = plainBuf.length;

  const cipher = createCipheriv('aes-256-cbc', aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plainBuf), cipher.final()]);
  const encInvoiceHash = sha256b64(encrypted);
  const encInvoiceSize = encrypted.length;
  const encInvoiceContent = encrypted.toString('base64');

  const sendResult = await api(
    'POST',
    `/sessions/online/${sessionRef}/invoices`,
    {
      invoiceHash,
      invoiceSize,
      encryptedInvoiceHash: encInvoiceHash,
      encryptedInvoiceSize: encInvoiceSize,
      encryptedInvoiceContent: encInvoiceContent,
      offlineMode: false,
    },
    accessToken,
  );
  console.log(`  Invoice ref: ${sendResult.referenceNumber}`);

  // ─── 7. Close session ──────────────────────────────────
  console.log('\n--- 7. Close session ---');
  try {
    await api('POST', `/sessions/online/${sessionRef}/close`, {}, accessToken);
    console.log('  Session closed');
  } catch {
    console.log('  Close failed (session still processing) — will retry after UPO');
  }

  // ─── 8. Poll UPO ──────────────────────────────────────
  console.log('\n--- 8. Polling UPO (max 5 min) ---');
  let upoSuccess = false;
  for (let i = 0; i < 60; i++) {
    const status = await api('GET', `/sessions/${sessionRef}`, undefined, accessToken);
    console.log(
      `  [${i}] Status: ${status.status.code} — success: ${status.successfulInvoiceCount ?? '?'}/${status.invoiceCount ?? '?'}`,
    );
    if (status.status.code === 200) {
      // Get invoice results
      const invoices = await api(
        'GET',
        `/sessions/${sessionRef}/invoices?pageSize=10`,
        undefined,
        accessToken,
      );
      if (invoices.invoices?.length > 0) {
        const inv = invoices.invoices[0];
        console.log(`\n  SUKCES! Numer KSeF: ${inv.ksefNumber}`);
        console.log(`   Invoice ref: ${inv.referenceNumber}`);
        console.log(`   Permanent storage: ${inv.permanentStorageDate}`);
      }
      upoSuccess = true;
      break;
    }
    if (status.status.code >= 400 && status.status.code !== 415) {
      console.error(`  Session failed with code ${status.status.code}: ${status.status.description}`);
      if (status.status.details) console.error('  Details:', status.status.details);
      // Still try to get invoice details
      try {
        const invoices = await api(
          'GET',
          `/sessions/${sessionRef}/invoices?pageSize=10`,
          undefined,
          accessToken,
        );
        if (invoices?.invoices) {
          for (const inv of invoices.invoices) {
            console.log(`  Invoice #${inv.ordinalNumber}: status ${inv.status?.code} — ${inv.status?.description}`);
            if (inv.status?.details) console.log('    Details:', inv.status.details);
          }
        }
      } catch {}
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  // Retry close after UPO
  if (upoSuccess) {
    try {
      await api('POST', `/sessions/online/${sessionRef}/close`, {}, accessToken);
      console.log('  Session closed after UPO');
    } catch {
      console.log('  Session already closed or cannot close');
    }
  }

  // ─── 9. Logout ─────────────────────────────────────────
  console.log('\n--- 9. Logout ---');
  try {
    await api('DELETE', '/auth/sessions/current', undefined, accessToken);
    console.log('  Auth terminated');
  } catch {
    console.log('  Auth termination failed (session may have expired)');
  }

  console.log('\n=== DONE ===\n');
}

main().catch((err) => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
