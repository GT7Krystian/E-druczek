import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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
  original_ksef_reference_number?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount_gross!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateDocumentItemDto)
  items!: CreateDocumentItemDto[];
}
