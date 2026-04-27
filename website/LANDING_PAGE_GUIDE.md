# Landing Page Guide

## Current implementation

The live site is the React/Vite app in `website/`, not an older static prototype.

## Editing flow

- content and structure: `src/App.jsx`
- global styles and tokens: `src/index.css`
- metadata and social tags: `index.html`
- legal pages and crawler assets: `public/`

## Messaging guardrails

- the native iOS app is the flagship client
- sign-in is Rutgers-email-only
- static lot data is bundled on-device
- dynamic occupancy and notifications come from the backend
- occupancy messaging should stay honest about weak vs strong live signal

## Pre-launch checklist for copy

- replace the App Store placeholder URL
- make sure screenshots match the current SwiftUI app
- keep privacy/support wording aligned with actual data collection
- avoid any React Native-first or JS-first framing

Last reviewed: 2026-04-26
