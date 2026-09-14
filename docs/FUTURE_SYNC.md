# Future Self-Hosted Synchronization

Status: idea recorded on 2026-09-14. Not implemented or committed as a release
requirement. Preserve WorldTube's standalone local mode.

Public communication should describe this as WorldTube's longer-term direction:
an optional self-hosted server and future mobile client that can synchronize
profiles and libraries. Do not present it as an existing service, and do not
use another project's name as a comparison or imply compatibility with it.

## Desired Experience

- An optional WorldTube server installed on a home machine or VPS, with a
  straightforward deployment guide and persistent data/backups.
- Desktop and a future mobile app connect to the same personal server.
- Synchronize profiles, subscriptions, saved videos, playlists, watch history
  and playback progress; preferences need per-device versus shared decisions.
- Continue using local data offline. Synchronization must not be required to
  watch a video or access the existing local library.
- Existing local export/import remains available for migration and recovery.

## Architectural Direction To Evaluate

1. Define a versioned synchronization API and shared data contracts. Existing
   Electron IPC APIs are local contracts, not a remotely deployable backend.
2. Add server authentication, device sessions, user isolation and persistent
   database migrations. Never publish the desktop's local database directly.
3. Plan stable record identities, offline change queues, conflict handling,
   deletion tombstones and synchronization cursors. Merging playlists and
   watched progress across devices needs explicit product rules.
4. Adapt the desktop as an optional sync client, then build the mobile client
   against the same API. Keep playback on devices initially; server-side
   YouTube extraction/proxying is a separate decision with bandwidth and
   datacenter bot-protection trade-offs, not part of basic library sync.
5. Package the service, not the Electron window, for headless deployment.
   Evaluate Docker Compose first; publish pinned images, health checks,
   persistent volumes, HTTPS guidance and backup/restore instructions.

Security work must include password hashing, revocable sessions, authorization
on every user's data, rate limits, TLS, secrets handling and safe migrations.
Do not copy the live desktop database file between concurrent devices.
Credentials and sessions must not be exported or synced as library records.

## Packaging Names The Owner May Recall

- **Flox**: Nix-based environments and OCI image generation. A possible match
  for the remembered name, not a confirmed choice or universally better Docker.
  [Official documentation](https://flox.dev/docs).
- **Nix flakes**: pinned package/configuration inputs and reproducible setup
  tooling. Not itself a container runtime or synchronization service.
  [Official NixOS wiki](https://wiki.nixos.org/wiki/Flakes).
- **Podman**: a daemonless OCI container engine, an alternative to Docker.
  [Official documentation](https://docs.podman.io/en/stable/).
- **Flatpak**: Linux desktop app distribution, not the packaging target for a
  headless VPS backend. Excluded from today's installer work by owner choice.

The reference experience is Immich's self-hosted server plus clients, not its
application source. Immich recommends Docker Compose for deployment:
[official installation guide](https://docs.immich.app/install/docker-compose/).
Docker Compose is a preliminary recommendation, not a final stack decision.

## Scope Boundary

No server, cloud account system, mobile app, container image, Compose file or
sync engine exists yet. Container packaging alone cannot provide these features.
Revisit this proposal separately from maintenance of the desktop release.
