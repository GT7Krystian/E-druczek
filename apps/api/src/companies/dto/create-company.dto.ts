import { IsEnum, IsString, Length, Matches } from 'class-validator';
import { VatStatus } from '@e-druczek/shared';

export class CreateCompanyDto {
  @Matches(/^\d{10}$/, { message: 'NIP must be exactly 10 digits' })
  nip!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  @IsEnum(VatStatus)
  vat_status!: VatStatus;
}
