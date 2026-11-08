
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Farm } from 'src/databases/entities/farms.entity';

@Injectable()
export class FarmService {
  constructor(
    @InjectRepository(Farm)
    private readonly farmRepository: Repository<Farm>,
  ) {}

  async getMyFarms(userId: number) {
    return this.farmRepository.find({
      where: {
        user_id: userId,
      },
      order: {
        id: 'ASC',
      },
    });
  }

  async getZonesByFarm(
    farmId: number,
    userId: number,
  ) {
    const farm = await this.farmRepository.findOne({
      where: {
        id: farmId,
        user_id: userId,
      },
      relations: {
        zones: true,
      },
    });

    if (!farm) {
      return null;
    }

    // Trạng thái bể thuộc Farm, được chia sẻ cho tất cả Zone.
    return farm.zones.map((zone) => ({
      ...zone,
      tank_status: farm.tank_status,
      tank_status_updated_at: farm.tank_status_updated_at,
    }));
  }
}
