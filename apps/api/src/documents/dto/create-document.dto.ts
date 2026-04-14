import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  Direction,
  InvoiceTarget,
  DocumentClass,
} from '@e-druczek/shared';
import { CreateDocumentItemDto } from './create-document-item.dto';

export class CreateDocumentDto {
  @IsUUID()
  company_id!: string;

  @IsEnum(Direction)
  direction!: Direction;

  @IsEnum(InvoiceTarget)
  invoice_target!: InvoiceTarget;

  @IsOptional()
  @IsEnum(DocumentClass)
  document_class?: DocumentClass;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  invoice_number?: string;

  @IsOptional()
  @IsDateString()
  issue_date?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount_gross!: number;

  // ─── Nabywca (Podmiot2) ───────────────────────────────

  @IsOptional()
  @Matches(/^\d{10}$/, { message: 'buyer_nip must be 10 digits' })
  buyer_nip?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  buyer_name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  buyer_address_line1?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  buyer_address_line2?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  buyer_country_code?: string;

  // ─── Korekta (opcjonalne) ─────────────────────────────

  @IsOptional()
  @IsString()
  original_ksef_reference_number?: string;

  @IsOptional()
  @IsDateString()
  original_issue_date?: string;

  @IsOptional()
  @IsString()
  original_invoice_number?: string;

  // ─── Pozycje ──────────────────────────────────────────

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentItemDto)
  items!: CreateDocumentItemDto[];
}
