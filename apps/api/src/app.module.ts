import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { DocumentsModule } from './documents/documents.module';
import { QueueModule } from './queue/queue.module';
import { XmlModule } from './xml/xml.module';
import { KsefModule } from './ksef/ksef.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    CompaniesModule,
    DocumentsModule,
    QueueModule,
    XmlModule,
    KsefModule,
  ],
})
export class AppModule {}
