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

  it('exposes liveness and propagates a validated request ID', async () => {
    const requestId = '10000000-0000-4000-8000-000000000027';
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-ID', requestId)
      .expect(200);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'OK', service: 'api' },
    });
  });

  it('exposes PostgreSQL and Redis readiness without connection details', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);

    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'READY',
        components: { postgresql: 'UP', redis: 'UP' },
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(JSON.stringify(response.body)).not.toMatch(/redis:\/\//i);
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
