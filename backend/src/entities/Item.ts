import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity({ name: 'items' })
@Index(['createdAt', 'id'], { unique: true })
export class Item {
  @PrimaryColumn('varchar')
  id: string;

  @Column('text')
  text: string;

  @Column('timestamptz')
  createdAt: string;

  @Column('timestamptz')
  updatedAt: string;
}
