-- Migration: Add coordinates column to parking_lots
-- Depends on: 20260215_init_schema.sql

ALTER TABLE public.parking_lots
  ADD COLUMN IF NOT EXISTS coordinates jsonb;
