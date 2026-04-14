import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { VatStatus } from '@e-druczek/shared';

export class CreateCompanyDto {
  @Matches(/^\d{10}$/, { message: 'NIP musi zawierać dokładnie 10 cyfr' })
  nip!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsEnum(VatStatus)
  vat_status!: VatStatus;

  /** Ulica i numer — używane w XML FA(3) jako AdresL1 */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  address_line1?: string;

  /** Kod pocztowy i miasto — używane w XML FA(3) jako AdresL2 */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  address_line2?: string;
}
