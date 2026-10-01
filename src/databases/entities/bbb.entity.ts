import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Zone } from './zone.entity';
import { Esp32Device } from './esp32.entity';
import { Actuator } from './actuator.entity';



@Entity('bbbs')
export class Bbb {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  zone_id: number;

  @Column({ unique: true })
  device_id: string;

  @Column()
  secret_key_hash: string;

  @Column()
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Zone, (zone) => zone.bbbs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'zone_id' })
  zone: Zone;

  @OneToMany(() => Esp32Device, (esp32) => esp32.bbb)
  esp32_devices: Esp32Device[];

  @OneToMany(() => Actuator, (actuator) => actuator.bbb)
  actuators: Actuator[];
}