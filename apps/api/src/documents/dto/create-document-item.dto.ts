import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { VatRate, VatExemptionNode } from '@e-druczek/shared';

export class CreateDocumentItemDto {
  @IsString()
  @Length(1, 512)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  quantity!: number;

  @IsString()
  unit!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unit_price_net!: number;

  @IsEnum(VatRate)
  vat_rate!: VatRate;

  @IsNumber({ maxDecimalPlaces: 2 })
  total_net!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  total_vat!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  total_gross!: number;

  @IsOptional()
  @IsEnum(VatExemptionNode)
  vat_exemption_node?: VatExemptionNode;

  @IsOptional()
  @IsString()
  vat_exemption_text?: string;

  @IsOptional()
  @IsBoolean()
  is_delta_correction?: boolean;
}
