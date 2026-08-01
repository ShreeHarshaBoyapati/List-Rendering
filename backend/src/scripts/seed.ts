import 'reflect-metadata';
import 'dotenv/config';
import { initializeDatabase } from '../config/data-source.js';
import { ItemService } from '../services/ItemService.js';

const TOTAL_ITEMS = Number(process.env.TOTAL_ITEMS) || 5000000;
const BATCH_SIZE = Number(process.env.BATCH_SIZE) || 10000;

async function main(): Promise<void> {
  await initializeDatabase();
  const itemService = await ItemService.getInstance();
  console.log(
    `Starting seed of ${TOTAL_ITEMS.toLocaleString()} items (batch size ${BATCH_SIZE.toLocaleString()})...`
  );
  await itemService.seed(TOTAL_ITEMS, BATCH_SIZE);
  console.log('Seeding complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
