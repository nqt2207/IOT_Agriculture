import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './user.entity';
import { Zone } from './zone.entity';
import { Bbb } from './bbb.entity';

@Entity('farms')
export class Farm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  name: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, (user) => user.farms, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => Zone, (zone) => zone.farm)
  zones: Zone[];

  @OneToOne(() => Bbb, (bbb) => bbb.farm)
  bbb: Bbb;
}