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
import { Zone } from './zone.entity';
import { Sensor } from './sensor.entity';
import { Actuator } from './actuator.entity';

@Entity('esp32_devices')
export class Esp32Device {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bbb_id: number;

  @Column({ nullable: true })
  zone_id: number | null;

  @Column({ unique: true })
  device_id: string;

  @Column()
  name: string;

  @Column({
    type: 'varchar',
  })
  scope: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Bbb, (bbb) => bbb.esp32_devices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bbb_id' })
  bbb: Bbb;

  @ManyToOne(() => Zone, (zone) => zone.esp32_devices, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'zone_id' })
  zone: Zone | null;

  @OneToMany(() => Sensor, (sensor) => sensor.esp32)
  sensors: Sensor[];

  @OneToMany(() => Actuator, (actuator) => actuator.esp32)
  actuators: Actuator[];
}