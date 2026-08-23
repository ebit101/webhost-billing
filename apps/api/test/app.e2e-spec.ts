import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ success: true, data: { message: 'Hello World!' } });
  });

  it('formats framework errors through the global API exception filter', () => {
    return request(app.getHttpServer())
      .get('/missing')
      .expect(404)
      .expect({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Resource was not found.',
        },
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
