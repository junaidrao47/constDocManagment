import crypto from "crypto";
import { FindOperator } from "typeorm";

/**
 * A small in-memory stand-in for a TypeORM repository.
 *
 * Only the operations the API actually calls are implemented, and anything else
 * throws loudly rather than returning a plausible empty result — a fake that
 * silently answers "no rows" to a query it does not understand turns a real bug into
 * a passing test.
 */

type Row = Record<string, unknown>;

/** Translates a SQL LIKE pattern into an equivalent regular expression. */
function likeToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
}

function matchesOperator(actual: unknown, operator: FindOperator<unknown>): boolean {
  switch (operator.type) {
    case "ilike":
    case "like":
      return likeToRegExp(String(operator.value)).test(String(actual ?? ""));
    case "moreThan":
      return compare(actual, operator.value) > 0;
    case "moreThanOrEqual":
      return compare(actual, operator.value) >= 0;
    case "lessThan":
      return compare(actual, operator.value) < 0;
    case "lessThanOrEqual":
      return compare(actual, operator.value) <= 0;
    case "in":
      return (operator.value as unknown[]).some((candidate) => matchesValue(actual, candidate));
    case "not":
      return !matchesValue(actual, operator.value);
    case "isNull":
      return actual === null || actual === undefined;
    default:
      throw new Error(
        `fake repository does not implement the "${operator.type}" find operator — add it rather than letting the query silently match nothing`,
      );
  }
}

function compare(left: unknown, right: unknown): number {
  const a = left instanceof Date ? left.getTime() : left;
  const b = right instanceof Date ? right.getTime() : right;

  if (typeof a === "number" && typeof b === "number") {
    return a === b ? 0 : a < b ? -1 : 1;
  }

  return String(a) === String(b) ? 0 : String(a) < String(b) ? -1 : 1;
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (expected instanceof FindOperator) {
    return matchesOperator(actual, expected as FindOperator<unknown>);
  }

  if (expected instanceof Date) {
    return actual instanceof Date && actual.getTime() === expected.getTime();
  }

  return actual === expected;
}

function matchesWhere(row: Row, where: Row | Row[] | undefined): boolean {
  if (!where) {
    return true;
  }

  // An array of conditions is an OR in TypeORM.
  if (Array.isArray(where)) {
    return where.some((clause) => matchesWhere(row, clause));
  }

  return Object.entries(where).every(([key, expected]) => matchesValue(row[key], expected));
}

function project<T extends Row>(row: T, select?: (keyof T)[]): T {
  if (!select || select.length === 0) {
    return { ...row };
  }

  const picked: Row = {};

  for (const key of select) {
    picked[key as string] = row[key];
  }

  return picked as T;
}

function sortRows<T extends Row>(rows: T[], order?: Record<string, "ASC" | "DESC" | undefined>): T[] {
  if (!order) {
    return rows;
  }

  const entries = Object.entries(order);

  return [...rows].sort((left, right) => {
    for (const [key, direction] of entries) {
      const result = compare(left[key], right[key]);

      if (result !== 0) {
        return direction === "DESC" ? -result : result;
      }
    }

    return 0;
  });
}

export interface FakeFindOptions<T extends Row> {
  where?: Row | Row[];
  select?: (keyof T)[];
  order?: Record<string, "ASC" | "DESC" | undefined>;
  skip?: number;
  take?: number;
}

export class FakeRepository<T extends Row> {
  private readonly rows: T[] = [];

  constructor(private readonly label: string) {}

  /** Direct insert for test setup; bypasses nothing, it is what `save` does. */
  seed(row: T): T {
    this.rows.push({ ...row });
    return { ...row };
  }

  all(): T[] {
    return this.rows.map((row) => ({ ...row }));
  }

  clear(): void {
    this.rows.length = 0;
  }

  create(partial: Partial<T> = {}): T {
    // Through `unknown` deliberately: `Partial<T>` and `T` do not overlap enough for a
    // direct assertion on a generic parameter, and `create` is only ever handed to
    // `save`, which fills in the rest.
    return { ...partial } as unknown as T;
  }

  async save(input: T | T[]): Promise<T | T[]> {
    if (Array.isArray(input)) {
      return Promise.all(input.map((item) => this.save(item) as Promise<T>));
    }

    const row = { ...input } as Row;

    if (typeof row.id !== "string" || row.id.length === 0) {
      row.id = crypto.randomUUID();
    }

    const now = new Date();
    row.createdAt = (row.createdAt as Date | undefined) ?? now;
    row.updatedAt = now;

    const index = this.rows.findIndex((existing) => existing.id === row.id);

    if (index === -1) {
      this.rows.push(row as T);
    } else {
      this.rows[index] = { ...this.rows[index], ...row } as T;
    }

    return { ...(this.rows.find((existing) => existing.id === row.id) as T) };
  }

  async findOne(options: FakeFindOptions<T>): Promise<T | null> {
    const matches = sortRows(
      this.rows.filter((row) => matchesWhere(row, options.where)),
      options.order,
    );

    return matches.length > 0 ? project(matches[0], options.select) : null;
  }

  async find(options: FakeFindOptions<T> = {}): Promise<T[]> {
    const matches = sortRows(
      this.rows.filter((row) => matchesWhere(row, options.where)),
      options.order,
    );

    const start = options.skip ?? 0;
    const end = options.take === undefined ? undefined : start + options.take;

    return matches.slice(start, end).map((row) => project(row, options.select));
  }

  async findAndCount(options: FakeFindOptions<T> = {}): Promise<[T[], number]> {
    const matches = this.rows.filter((row) => matchesWhere(row, options.where));
    const page = await this.find(options);

    return [page, matches.length];
  }

  async count(options: FakeFindOptions<T> = {}): Promise<number> {
    return this.rows.filter((row) => matchesWhere(row, options.where)).length;
  }

  async update(criteria: Row, partial: Partial<T>): Promise<{ affected: number }> {
    let affected = 0;

    this.rows.forEach((row, index) => {
      if (matchesWhere(row, criteria)) {
        this.rows[index] = { ...row, ...partial, updatedAt: new Date() } as T;
        affected += 1;
      }
    });

    return { affected };
  }

  async delete(criteria: Row): Promise<{ affected: number }> {
    const remaining = this.rows.filter((row) => !matchesWhere(row, criteria));
    const affected = this.rows.length - remaining.length;

    this.rows.length = 0;
    this.rows.push(...remaining);

    return { affected };
  }

  createQueryBuilder(): never {
    throw new Error(`fake repository for ${this.label} does not support createQueryBuilder`);
  }
}
