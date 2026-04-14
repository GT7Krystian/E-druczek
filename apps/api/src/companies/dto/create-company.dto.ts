import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { VatStatus } from '@e-druczek/shared';
import { IsPolishNip } from '../../common/nip.validator';

export class CreateCompanyDto {
  @IsPolishNip()
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
