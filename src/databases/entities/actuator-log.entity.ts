import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Actuator } from './actuator.entity';

@Entity('actuator_logs')
export class ActuatorLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    nullable: true,
  })
  actuator_id: number | null;

  @Column()
  actuator_name: string;

  @Column({
    type: 'varchar',
    nullable: true,
  })
  control_mode: string | null;

  @Column({
    type: 'boolean',
    nullable: true,
  })
  commanded_state: boolean | null;

  @Column({
    type: 'boolean',
    nullable: true,
  })
  actual_state: boolean | null;

  @Column({
    type: 'varchar',
  })
  source: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Actuator, (actuator) => actuator.logs, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actuator_id' })
  actuator: Actuator | null;
}