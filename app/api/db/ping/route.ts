// app/api/db/ping/route.ts
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  const { rows } = await sql`select 1 as ok`;
  return NextResponse.json(rows[0]);
}