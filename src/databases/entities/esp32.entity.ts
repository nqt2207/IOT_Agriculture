import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';


import { Bbb } from './bbb.entity';
import { Sensor } from './sensor.entity';

@Entity('esp32_devices')
export class Esp32Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bbb_id: number;

  @Column({ unique: true })
  device_id: string;

  @Column()
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Bbb, (bbb) => bbb.esp32_devices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bbb_id' })
  bbb: Bbb;

  @OneToMany(() => Sensor, (sensor) => sensor.esp32)
  sensors: Sensor[];
}