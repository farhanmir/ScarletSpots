# ScarletSpots: OCI Always Free Migration Plan

This document outlines the strategy to migrate ScarletSpots from Supabase to a self-hosted architecture on Oracle Cloud Infrastructure (OCI) Always Free, designed to support 50k+ users with zero infrastructure costs.

## 1. Executive Summary
The migration trades the convenience of Supabase for the massive performance and scale of OCI's ARM Ampere tokens (4 OCPUs, 24GB RAM). This transition enables university-wide scale while removing the limitations of Supabase's free tier.

## 2. Competitive Advantage: OCI vs. Supabase

| Resource | Supabase Free | OCI Always Free (ARM) | Benefit |
| :--- | :--- | :--- | :--- |
| **Compute** | Shared/Burstable | 4 Dedicated OCPUs | Higher throughput for FastAPI |
| **Memory** | < 1GB | 24GB RAM | Massive caching & in-memory DB |
| **Storage** | 500MB | 200GB Block Volume | Large-scale parking history |
| **Realtime** | 200 concurrent | Unlimited | Better performance for 50k users |

## 3. Technical Architecture

### Core Stack
- **Compute**: Ubuntu 22.04 on OCI ARM (A1).
- **Database**: PostgreSQL 16+ (Self-hosted) with PostGIS.
- **Cache/Realtime**: Redis (Self-hosted) for session caching and WebSocket pub/sub.
- **Backend**: FastAPI (Python 3.14+) running in Docker.

### Auth Migration (Rutgers SSO)
- **Current**: Supabase Auth (Email/Social).
- **Target**: Rutgers CAS 3.0 Integration.
- **Flow**: Mobile app → Rutgers CAS login → Backend validates ticket → Backend issues JWT.
- **Result**: No passwords stored; NetID-native login.

### Realtime Occupancy
- Replace Supabase Realtime with **FastAPI WebSockets + Redis**.
- Backend publishes occupancy changes to Redis; WebSocket workers broadcast to connected devices.

## 4. Implementation Steps

1. **Environment Setup**:
   - Provision OCI ARM Instance.
   - Configure Security Lists (Ports 80, 443, 22).
   - Install Docker & Docker Compose.

2. **Database Migration**:
   - Export schema and data from Supabase (`pg_dump`).
   - Restore to OCI Postgres instance.

3. **Backend Updates**:
   - Implement Rutgers CAS validation service.
   - Set up WebSocket Manager for occupancy updates.
   - Configure OCI Object Storage for media assets.

4. **DevOps & Maintenance**:
   - Configure OCI Volume Backups (5 free).
   - Setup GitHub Actions for automated deployment.
   - Use Cloudflare for SSL and DNS management.

## 5. Security & Persistence
- **Firewall**: Restrict OCI Security Lists to necessary ports only.
- **Backups**: Daily `pg_dump` to OCI Object Storage bucket.
- **Persistence**: Data stored on a 200GB OCI Block Volume with high IOPS.

---
*Drafted: March 2026*
