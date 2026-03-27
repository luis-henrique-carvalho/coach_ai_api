import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { getConnectionToken } from '@nestjs/mongoose';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const mockConnection = {
      readyState: 1, // 1 = connected
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return ok status with connected database', () => {
    const result = controller.health();
    expect(result).toEqual({
      status: 'ok',
      database: 'connected',
    });
  });

  it('should return ok status with disconnected database', async () => {
    const mockConnection = {
      readyState: 0,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
      ],
    }).compile();

    const disconnectedController =
      module.get<HealthController>(HealthController);
    const result = disconnectedController.health();
    expect(result).toEqual({
      status: 'ok',
      database: 'disconnected',
    });
  });
});
