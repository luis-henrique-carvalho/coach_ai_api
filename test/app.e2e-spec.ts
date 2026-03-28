import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let connection: Connection;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    connection = moduleFixture.get<Connection>(getConnectionToken());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (connection) {
      await connection.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer() as string)
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
