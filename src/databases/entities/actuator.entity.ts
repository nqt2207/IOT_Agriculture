import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Esp32Device } from './esp32.entity';
import { ActuatorLog } from './actuator-log.entity';

@Entity('actuators')
export class Actuator {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  esp32_id: number;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column({
    type: 'varchar',
    default: 'auto',
  })
  control_mode: string;

  @Column({
    type: 'boolean',
    default: false,
  })
  desired_state: boolean;

  @Column({
    type: 'boolean',
    nullable: true,
  })
  actual_state: boolean | null;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  reported_control_mode: string | null;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  state_updated_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Esp32Device, (esp32) => esp32.actuators, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'esp32_id' })
  esp32: Esp32Device;

  @OneToMany(() => ActuatorLog, (log) => log.actuator)
  logs: ActuatorLog[];
}