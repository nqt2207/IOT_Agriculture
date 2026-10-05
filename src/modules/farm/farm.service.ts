import {
  Injectable,
} from '@nestjs/common';

import {
  InjectRepository,
} from '@nestjs/typeorm';
import { Farm } from 'src/databases/entities/farms.entity';

import {
  Repository,
} from 'typeorm';



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

    return farm.zones;
  }
}