import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Farm } from './farms.entity';


@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password_hash: string;

  @Column({ unique: true })
  email: string;

  @Column({
    type: 'varchar',
    default: 'user',
  })
  role: string;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Farm, (farm) => farm.user)
  farms: Farm[];
}