import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Esp32Device } from './esp32.entity';



@Entity('sensors')
export class Sensor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  esp32_id: number;

  @Column()
  name: string;

  @Column()
  sensor_type: string;

  @Column()
  unit: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Esp32Device, (esp32) => esp32.sensors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'esp32_id' })
  esp32: Esp32Device;
}