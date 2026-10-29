import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from '@/database/config/database.options';

// DataSource này là entry point duy nhất cho TypeORM CLI generate/run/revert migration.
export default new DataSource(createDatabaseOptions());
