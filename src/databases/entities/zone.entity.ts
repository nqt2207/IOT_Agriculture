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
import { Bbb } from './bbb.entity';
import { Actuator } from './actuator.entity';



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

  @OneToMany(() => Bbb, (bbb) => bbb.zone)
  bbbs: Bbb[];

}