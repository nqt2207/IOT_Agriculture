
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

  // 0 = AVAILABLE, 1 = EMPTY, null = UNKNOWN
  @Column({
    type: 'smallint',
    nullable: true,
    default: null,
  })
  tank_status: number | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
    default: null,
  })
  tank_status_updated_at: Date | null;

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
