import { Injectable } from '@nestjs/common';

@Injectable()
export class InvoicesService {
  findAll() {
    return [];
  }

  findOne(id: string) {
    return { id };
  }

  create(dto: unknown) {
    return dto;
  }
}
