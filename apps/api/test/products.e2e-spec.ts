import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  parseApiEnvironment,
  type ApiEnvironment,
} from '@webhost-billing/config';
import {
  CustomerStatus,
  UserRole,
  UserStatus,
  type PrismaClient,
} from '@webhost-billing/database';
import {
  apiErrorResponseSchema,
  apiSuccessResponseSchema,
  productSchema,
  publicProductSchema,
} from '@webhost-billing/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { z } from 'zod';
import { AppModule } from '../src/app.module';
import { PRISMA_CLIENT } from '../src/infrastructure/database/database.module';
import { API_ENVIRONMENT } from '../src/infrastructure/environment/environment.module';
import { PasswordHasherService } from '../src/modules/auth/services/password-hasher.service';

const ADMIN_EMAIL = 'command8-admin@example.test';
const CUSTOMER_EMAIL = 'command8-customer@example.test';
const PASSWORD = 'command eight secure password';
const PRODUCT_SLUG = 'command-eight-hosting';

describe('Products and pricing (e2e)', () => {
  let app: INestApplication<App>;
  let moduleFixture: TestingModule;
  let prisma: PrismaClient;
  let passwords: PasswordHasherService;
  let productId = '';

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(API_ENVIRONMENT)
      .useValue(loadTestEnvironment())
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PRISMA_CLIENT);
    passwords = moduleFixture.get(PasswordHasherService);
    await cleanup();
    const passwordHash = await passwords.hash(PASSWORD);
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        adminProfile: {
          create: { displayName: 'Command Eight Admin', isSuperAdmin: true },
        },
      },
    });
    await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        customer: {
          create: {
            customerNumber: 'CMD8-CUST',
            status: CustomerStatus.ACTIVE,
            firstName: 'Command',
            lastName: 'Eight',
            addressLine1: '8 Test Avenue',
            city: 'Dhaka',
            countryCode: 'BD',
          },
        },
      },
    });
  });

  it('keeps drafts private and requires a complete product before activation', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    const response = await admin
      .post('/products')
      .set('X-CSRF-Token', csrf)
      .send({
        slug: PRODUCT_SLUG,
        name: 'Command Eight Hosting',
        publicVisible: true,
        displayOrder: 80,
        prices: [
          {
            billingPeriod: 'MONTHLY',
            currency: 'BDT',
            amount: '10000',
          },
        ],
      })
      .expect(201);
    const product = apiSuccessResponseSchema(productSchema).parse(
      response.body,
    ).data;
    productId = product.id;
    expect(product.status).toBe('DRAFT');

    const publicResponse = await request(app.getHttpServer())
      .get('/products/public')
      .expect(200);
    expect(
      apiSuccessResponseSchema(z.array(publicProductSchema))
        .parse(publicResponse.body)
        .data.some((item) => item.id === productId),
    ).toBe(false);

    const activation = await admin
      .patch(`/products/${productId}/status`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'ACTIVE' })
      .expect(422);
    expect(apiErrorResponseSchema.parse(activation.body).error.code).toBe(
      'UNPROCESSABLE_ENTITY',
    );
  });

  it('edits, orders, versions prices, activates, and publicly exposes the product', async () => {
    const admin = request.agent(app.getHttpServer());
    const csrf = await csrfToken(admin);
    await login(admin, csrf, ADMIN_EMAIL);
    await admin
      .patch(`/products/${productId}`)
      .set('X-CSRF-Token', csrf)
      .send({
        description: 'A complete fictional hosting plan.',
        displayOrder: 8,
        publicVisible: true,
        hostingPackageIdentifier: 'cmd8_package',
        storageFeature: '20 GB SSD',
        websiteFeature: '3 websites',
        emailFeature: '25 email accounts',
        bandwidthFeature: '500 GB monthly',
      })
      .expect(200);
    await admin
      .post(`/products/${productId}/prices`)
      .set('X-CSRF-Token', csrf)
      .send({
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        amount: '12000',
        setupFee: '500',
      })
      .expect(201);
    await admin
      .post(`/products/${productId}/prices`)
      .set('X-CSRF-Token', csrf)
      .send({
        billingPeriod: 'ANNUAL',
        currency: 'BDT',
        amount: '120000',
        setupFee: '0',
      })
      .expect(201);
    await admin
      .patch(`/products/${productId}/status`)
      .set('X-CSRF-Token', csrf)
      .send({ status: 'ACTIVE' })
      .expect(200);

    const list = await admin.get('/products').expect(200);
    const products = apiSuccessResponseSchema(z.array(productSchema)).parse(
      list.body,
    ).data;
    const product = products.find((item) => item.id === productId);
    expect(product?.displayOrder).toBe(8);
    expect(product?.prices.filter((price) => price.isActive)).toHaveLength(2);
    expect(product?.prices.filter((price) => !price.isActive)).toHaveLength(1);

    const catalog = await request(app.getHttpServer())
      .get('/products/public?currency=BDT')
      .expect(200);
    const publicProduct = apiSuccessResponseSchema(z.array(publicProductSchema))
      .parse(catalog.body)
      .data.find((item) => item.id === productId);
    expect(publicProduct?.features.storage).toBe('20 GB SSD');
    expect(
      publicProduct?.prices.find((price) => price.billingPeriod === 'ANNUAL')
        ?.amount.amount,
    ).toBe('120000');
    expect(JSON.stringify(publicProduct)).not.toContain('cmd8_package');

    const invalidEdit = await admin
      .patch(`/products/${productId}`)
      .set('X-CSRF-Token', csrf)
      .send({ storageFeature: null })
      .expect(422);
    expect(apiErrorResponseSchema.parse(invalidEdit.body).error.code).toBe(
      'UNPROCESSABLE_ENTITY',
    );
  });

  it('denies customer administration and archives without deleting history', async () => {
    const customer = request.agent(app.getHttpServer());
    const customerCsrf = await csrfToken(customer);
    await login(customer, customerCsrf, CUSTOMER_EMAIL);
    await customer.get('/products').expect(403);
    await customer
      .patch(`/products/${productId}`)
      .set('X-CSRF-Token', customerCsrf)
      .send({ name: 'Forbidden change' })
      .expect(403);

    const admin = request.agent(app.getHttpServer());
    const adminCsrf = await csrfToken(admin);
    await login(admin, adminCsrf, ADMIN_EMAIL);
    await admin
      .patch(`/products/${productId}/status`)
      .set('X-CSRF-Token', adminCsrf)
      .send({ status: 'ARCHIVED' })
      .expect(200);

    const archived = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      include: { prices: true },
    });
    expect(archived.status).toBe('ARCHIVED');
    expect(archived.publicVisible).toBe(false);
    expect(archived.deletedAt).toBeNull();
    expect(archived.prices).toHaveLength(3);
    expect(archived.prices.every((price) => price.deletedAt === null)).toBe(
      true,
    );
    const catalog = await request(app.getHttpServer())
      .get('/products/public')
      .expect(200);
    expect(
      apiSuccessResponseSchema(z.array(publicProductSchema))
        .parse(catalog.body)
        .data.some((item) => item.id === productId),
    ).toBe(false);
    const auditActions = await prisma.activityLog.findMany({
      where: { entityId: productId },
      select: { action: true },
    });
    expect(auditActions.map((item) => item.action).sort()).toEqual([
      'PRODUCT_ACTIVE_BY_ADMIN',
      'PRODUCT_ARCHIVED_BY_ADMIN',
      'PRODUCT_CREATED_BY_ADMIN',
      'PRODUCT_PRICE_DEFINED_BY_ADMIN',
      'PRODUCT_PRICE_DEFINED_BY_ADMIN',
      'PRODUCT_UPDATED_BY_ADMIN',
    ]);
  });

  afterAll(async () => {
    if (prisma) await cleanup();
    if (app) await app.close();
  });

  async function csrfToken(agent: ReturnType<typeof request.agent>) {
    const response = await agent.get('/auth/csrf').expect(200);
    return apiSuccessResponseSchema(
      z.object({ csrfToken: z.string().min(32) }).strict(),
    ).parse(response.body).data.csrfToken;
  }

  async function login(
    agent: ReturnType<typeof request.agent>,
    csrf: string,
    email: string,
  ) {
    await agent
      .post('/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email, password: PASSWORD })
      .expect(200);
  }

  async function cleanup() {
    const product = await prisma.product.findUnique({
      where: { slug: PRODUCT_SLUG },
      select: { id: true },
    });
    if (product) {
      await prisma.activityLog.deleteMany({ where: { entityId: product.id } });
      await prisma.productPrice.deleteMany({
        where: { productId: product.id },
      });
      await prisma.product.delete({ where: { id: product.id } });
    }
    const users = await prisma.user.findMany({
      where: { email: { in: [ADMIN_EMAIL, CUSTOMER_EMAIL] } },
      select: { id: true },
    });
    const userIds = users.map((item) => item.id);
    if (!userIds.length) return;
    await prisma.activityLog.deleteMany({
      where: { actorUserId: { in: userIds } },
    });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.adminProfile.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.customer.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  function loadTestEnvironment(): ApiEnvironment {
    return parseApiEnvironment({
      ...process.env,
      PORT: process.env.API_PORT ?? '3001',
      NODE_ENV: 'test',
      AUTH_RATE_LIMIT_NAMESPACE: `product-e2e-${randomUUID()}`,
    });
  }
});
