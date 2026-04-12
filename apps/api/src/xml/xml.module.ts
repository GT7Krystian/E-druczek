import { Module } from '@nestjs/common';
import { XmlGeneratorService } from './xml-generator.service';
import { XsdValidatorService } from './xsd-validator.service';

@Module({
  providers: [XmlGeneratorService, XsdValidatorService],
  exports: [XmlGeneratorService, XsdValidatorService],
})
export class XmlModule {}
