import { IsString, Matches, MinLength } from 'class-validator';

/**
 * DTO for saving / updating a KSeF API token for a company.
 * Format: {date}-{variant}-{hash}|nip-{nip}|{token}
 * Example: 20260414-EC-41CF81D000-D0F6F7DD74-24|nip-5260250274|47762c4f...
 */
export class UpsertKsefTokenDto {
  @IsString()
  @MinLength(20)
  @Matches(/^[^|]+\|nip-\d{10}\|[0-9a-f]+$/, {
    message: 'Nieprawidłowy format tokenu KSeF. Oczekiwano: {data}-{wariant}|nip-{NIP}|{hash}',
  })
  token!: string;
}
