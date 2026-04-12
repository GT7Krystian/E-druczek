import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface XsdValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates XML against the FA(3) XSD schema using xmllint-wasm.
 *
 * Loaded lazily — xmllint-wasm is an ESM-only package, so we import it
 * dynamically inside the first call. The schema files are loaded once
 * from disk and reused (preload) so dependent imports resolve offline.
 */
@Injectable()
export class XsdValidatorService implements OnModuleInit {
  private readonly logger = new Logger(XsdValidatorService.name);
  private xmllint: any = null;
  private preload: { fileName: string; contents: string }[] = [];
  private ready = false;

  async onModuleInit(): Promise<void> {
    try {
      const schemasDir = join(__dirname, 'schemas');
      const fa3 = readFileSync(join(schemasDir, 'FA-3.xsd'), 'utf-8');
      const struktury = readFileSync(
        join(schemasDir, 'StrukturyDanych_v10-0E.xsd'),
        'utf-8',
      );
      const elementarne = readFileSync(
        join(schemasDir, 'ElementarneTypyDanych_v10-0E.xsd'),
        'utf-8',
      );

      this.preload = [
        { fileName: 'FA-3.xsd', contents: fa3 },
        {
          fileName:
            'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/StrukturyDanych_v10-0E.xsd',
          contents: struktury,
        },
        {
          fileName:
            'http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/ElementarneTypyDanych_v10-0E.xsd',
          contents: elementarne,
        },
      ];

      // Try to load xmllint-wasm (ESM); if it fails (e.g. not installed),
      // validator stays disabled and reports a warning instead of crashing.
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const dynamicImport = new Function('m', 'return import(m)') as (
          m: string,
        ) => Promise<any>;
        const mod = await dynamicImport('xmllint-wasm');
        this.xmllint = mod.xmllint ?? mod.default ?? mod;
        this.ready = true;
        this.logger.log('XSD validator ready (xmllint-wasm loaded)');
      } catch (err) {
        this.logger.warn(
          `xmllint-wasm not available (${(err as Error).message}); ` +
            'XsdValidatorService will return valid=false with a stub error. ' +
            'Run: npm install xmllint-wasm --workspace=apps/api',
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to load FA(3) XSD schemas: ${(err as Error).message}`,
      );
    }
  }

  async validate(xml: string): Promise<XsdValidationResult> {
    if (!this.ready || !this.xmllint) {
      return {
        valid: false,
        errors: [
          'XSD validator not initialized (xmllint-wasm missing). ' +
            'Install with: npm install xmllint-wasm --workspace=apps/api',
        ],
      };
    }

    try {
      const result = await this.xmllint.validateXML({
        xml: [{ fileName: 'invoice.xml', contents: xml }],
        schema: ['FA-3.xsd'],
        preload: this.preload,
      });

      const valid = result.valid === true || result.errors?.length === 0;
      const errors: string[] = (result.errors ?? []).map((e: any) =>
        typeof e === 'string' ? e : (e.message ?? JSON.stringify(e)),
      );
      return { valid, errors };
    } catch (err) {
      return {
        valid: false,
        errors: [`xmllint runtime error: ${(err as Error).message}`],
      };
    }
  }
}
