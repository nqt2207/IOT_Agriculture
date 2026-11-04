import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Farm } from './farms.entity';
import { Esp32Device } from './esp32.entity';

@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  farm_id: number;

  @Column()
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Farm, (farm) => farm.zones, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @OneToMany(() => Esp32Device, (esp32) => esp32.zone)
  esp32_devices: Esp32Device[];
}