# Sable AI

Sable is a personalized, voice-first AI assistant designed to converse naturally, operate a user's computer with permission, and connect to the services they choose.

Sable is both the product and the default assistant identity. Future customers can
personalize the voice, appearance, personality, and wake phrase.

## Current milestone

- Interactive product surface and assistant customizer
- Animated assistant orb with listening/thinking states
- Live OpenAI Realtime voice transport over WebRTC
- Spoken and typed conversation with interruption handling
- Server-protected API credentials and privacy-safe safety identifiers
- Device-local assistant name and color preferences
- Safety-first roadmap for sensitive actions
- Responsive Sites deployment

## Product architecture

1. **Sable Web** — customer account, assistant profile, connected services, permissions, and activity.
2. **Sable Voice** — OpenAI Realtime voice sessions using WebRTC, server-side tools, and explicit confirmation boundaries.
3. **Sable Companion** — signed Windows application that performs approved local actions.
4. **Sable Cloud** — multi-tenant profiles, encrypted connector metadata, device registration, audit events, and subscriptions.

## Security model

- Read-only actions can be permitted by category.
- Sending, purchasing, deleting, installing, or elevated commands require confirmation by default.
- API secrets stay server-side or in the operating-system credential store.
- Every computer action produces an audit event.
- A global pause control disables new actions immediately.

## Development

```bash
npm run install:ci
npm run build
```

The first release is a private founder preview. Configure `OPENAI_API_KEY` as a
server-side secret to activate voice. Cloud profiles and computer control will be
introduced as separately testable milestones.
