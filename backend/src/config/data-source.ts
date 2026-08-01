import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Item } from '../entities/Item.js';

const {
  DATABASE_HOST = 'localhost',
  DATABASE_PORT = '5432',
  DATABASE_USERNAME = 'postgres',
  DATABASE_PASSWORD = 'postgres',
  DATABASE_NAME = 'rendering_list',
} = process.env;

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: DATABASE_HOST,
  port: Number(DATABASE_PORT),
  username: DATABASE_USERNAME,
  password: DATABASE_PASSWORD,
  database: DATABASE_NAME,
  synchronize: process.env.NODE_ENV !== 'prod',
  logging: false,
  entities: [Item],
  migrations: [],
  subscribers: [],
});

let initialized = false;

export async function initializeDatabase(): Promise<DataSource> {
  if (initialized) {
    return AppDataSource;
  }
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  initialized = true;
  return AppDataSource;
}
