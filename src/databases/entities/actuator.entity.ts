import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Bbb } from './bbb.entity';



@Entity('actuators')
export class Actuator {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column()
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Bbb, (bbb) => bbb.actuators, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bbb_id' })
  bbb: Bbb;
}