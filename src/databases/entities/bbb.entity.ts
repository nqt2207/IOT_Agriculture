import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Farm } from './farms.entity';
import { Esp32Device } from './esp32.entity';

@Entity('bbbs')
export class Bbb {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  farm_id: number;

  @Column({ unique: true })
  device_id: string;

  @Column()
  secret_key_hash: string;

  @Column()
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToOne(() => Farm, (farm) => farm.bbb, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'farm_id' })
  farm: Farm;

  @OneToMany(() => Esp32Device, (esp32) => esp32.bbb)
  esp32_devices: Esp32Device[];
}