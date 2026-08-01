import 'reflect-metadata';
import { Repository } from 'typeorm';
import { initializeDatabase } from '../config/data-source.js';
import { Item } from '../entities/Item.js';

export class ItemService {
  private static instance: ItemService | null = null;
  private repository: Repository<Item> | null = null;

  private constructor() {}

  static async getInstance(): Promise<ItemService> {
    if (!ItemService.instance) {
      ItemService.instance = new ItemService();
      await ItemService.instance.initialize();
    }
    return ItemService.instance;
  }

  private async initialize(): Promise<void> {
    const dataSource = await initializeDatabase();
    this.repository = dataSource.getRepository(Item);
  }

  getRepo(): Repository<Item> {
    if (!this.repository) {
      throw new Error('ItemService not initialized');
    }
    return this.repository;
  }

  async seed(totalItems: number, batchSize = 10000): Promise<void> {
    const repo = this.getRepo();
    const count = await repo.count();
    if (count >= totalItems) {
      return;
    }

    const now = Date.now();
    const seedEpoch = now;

    for (let batchStart = count + 1; batchStart <= totalItems; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize - 1, totalItems);
      const entities: Item[] = [];

      for (let i = batchStart; i <= batchEnd; i++) {
        const id = `item-${i}`;
        const createdAt = new Date(seedEpoch - (totalItems - i) * 1000).toISOString();
        entities.push({
          id,
          text: `Item ${i}`,
          createdAt,
          updatedAt: createdAt,
        });
      }

      await repo.save(entities);
      if (typeof process !== 'undefined' && process.stdout?.isTTY) {
        process.stdout.write(
          `\rSeeded ${batchEnd.toLocaleString()} / ${totalItems.toLocaleString()} items`
        );
      }
    }

    if (typeof process !== 'undefined' && process.stdout?.isTTY) {
      process.stdout.write('\n');
    }
  }

  async findNextPage(
    limit: number,
    cursor?: { createdAt: string; id: string } | null
  ): Promise<{ data: Item[]; hasNext: boolean }> {
    const repo = this.getRepo();

    let query = repo
      .createQueryBuilder('item')
      .orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'ASC');

    if (cursor) {
      const createdAt = new Date(cursor.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new Error('invalid cursor: createdAt is not a valid ISO timestamp');
      }

      const isoCreatedAt = createdAt.toISOString();

      query = query.where(
        `(item.createdAt < CAST(:createdAt AS timestamptz) OR (item.createdAt = CAST(:createdAt AS timestamptz) AND item.id < :id))`,
        { createdAt: isoCreatedAt, id: cursor.id }
      );
    }

    query = query.take(limit + 1);
    const rawItems = await query.getMany();

    const hasMore = rawItems.length > limit;
    const items = hasMore ? rawItems.slice(0, limit) : rawItems;

    let hasNext = hasMore;

    if (!cursor) {
      const total = await repo.count();
      hasNext = items.length < total && items.length > 0;
    }

    return { data: items, hasNext };
  }

  async findPrevPage(
    limit: number,
    cursor: { createdAt: string; id: string }
  ): Promise<{ data: Item[]; hasPrev: boolean }> {
    const repo = this.getRepo();

    const createdAt = new Date(cursor.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error('invalid cursor: createdAt is not a valid ISO timestamp');
    }

    const isoCreatedAt = createdAt.toISOString();

    // Inverted WHERE to fetch the page *above* the given cursor.
    const query = repo
      .createQueryBuilder('item')
      .where(
        `(item.createdAt > CAST(:createdAt AS timestamptz) OR (item.createdAt = CAST(:createdAt AS timestamptz) AND item.id > :id))`,
        { createdAt: isoCreatedAt, id: cursor.id }
      )
      .orderBy('item.createdAt', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .take(limit + 1);

    const rawItems = await query.getMany();

    const hasMore = rawItems.length > limit;
    const itemsAsc = hasMore ? rawItems.slice(0, limit) : rawItems;

    // Restore the global DESC order expected by the UI before returning.
    const items = itemsAsc.reverse();

    return { data: items, hasPrev: hasMore };
  }

  async findById(id: string): Promise<Item | null> {
    return this.getRepo().findOne({ where: { id } });
  }

  async create(text: string): Promise<Item> {
    const repo = this.getRepo();
    const now = new Date().toISOString();
    const item = repo.create({
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: text.trim(),
      createdAt: now,
      updatedAt: now,
    });
    return repo.save(item);
  }

  async update(id: string, text: string): Promise<Item | null> {
    const repo = this.getRepo();
    const item = await repo.findOne({ where: { id } });
    if (!item) {
      return null;
    }

    item.text = text.trim();
    item.updatedAt = new Date().toISOString();
    return repo.save(item);
  }

  async delete(id: string): Promise<Item | null> {
    const repo = this.getRepo();
    const item = await repo.findOne({ where: { id } });
    if (!item) {
      return null;
    }

    await repo.remove(item);
    return item;
  }

  async count(): Promise<number> {
    return this.getRepo().count();
  }
}
