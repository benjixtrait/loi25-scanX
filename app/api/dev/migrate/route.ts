// app/api/dev/migrate/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    await sql`create table if not exists scan_requests (
      id uuid primary key default gen_random_uuid(),
      website_url text not null,
      didomi_report_id text not null,
      status text not null default 'queued',
      score integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );`;
    await sql`create table if not exists scan_contacts (
      id uuid primary key default gen_random_uuid(),
      scan_id uuid not null references scan_requests(id) on delete cascade,
      email text not null,
      first_name text,
      last_name text,
      notify_ready boolean not null default true,
      marketing_opt_in boolean not null default false,
      notified_at timestamptz,
      magic_token text not null unique
    );`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
