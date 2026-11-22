import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const passCodes = pgTable('pass_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  durationMonths: integer('duration_months').notNull(),
  isUsed: boolean('is_used').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const activatedCodes = pgTable('activated_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  deviceId: text('device_id').notNull(),
  durationMonths: integer('duration_months').notNull(),
  activatedAt: timestamp('activated_at').defaultNow(),
  expiryDate: timestamp('expiry_date').notNull(),
});

export const blacklistedCodes = pgTable('blacklisted_codes', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  deviceId: text('device_id').notNull(),
  activatedAt: text('activated_at').notNull(),
  expiredAt: text('expired_at').notNull(),
  blacklistedAt: timestamp('blacklisted_at').defaultNow(),
  reason: text('reason'),
});

export const paymentRequests = pgTable('payment_requests', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  paymentMethod: text('payment_method').notNull(),
  accountNumber: text('account_number').notNull(),
  trxId: text('trx_id').notNull(),
  amount: text('amount').notNull(),
  planName: text('plan_name').notNull(),
  status: text('status').default('pending'),
  issuedCode: text('issued_code'),
  createdAt: timestamp('created_at').defaultNow(),
});
