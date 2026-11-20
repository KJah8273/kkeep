# Kkeep YouTube hosting decision

The Kkeep frontend can use its existing Profile storage, but Invidious requires separate long-running Invidious, companion, and PostgreSQL services. It cannot execute as the existing Cloudflare Worker frontend backend. The reviewable source fork and Compose recipe are in `infra/invidious/README.md`; no host has been purchased or deployed by preparing them.

The current Invidious and companion upstream revisions are pinned in `infra/invidious/PROVENANCE.json`, their AGPL source and licenses are included, Docker base images are digest pinned, and a corresponding-source archive generator is provided. This is a local source fork; it does not assert that a separate GitHub fork or running instance already exists.

## Resources and provider support

[Official Invidious installation documentation](https://docs.invidious.io/installation/) states a minimum of 20 GB storage and 2 GB free runtime memory for Invidious plus companion with regular restarts. Compilation needs at least 2.5 GB free memory, with 4 GB recommended. Its ideal public-instance sizing is substantially larger (60 GB disk, 4 GB RAM, two vCPUs, and a large traffic allowance). PostgreSQL and host overhead also need capacity.

The same documentation explicitly does not support PaaS/SaaS deployments and warns that bandwidth-intensive proxy use can trigger provider abuse suspension. This is an upstream support limitation, not evidence that Railway specifically bans Invidious. Railway is a possible infrastructure choice only after verifying its current acceptable use, technical suitability, storage limits, and bandwidth budget. A conventional Linux Docker host with adequate included traffic follows upstream's documented installation more closely.

## Railway price facts checked 2026-10-25

The [official Railway pricing page](https://railway.com/pricing) lists:

| Item | Listed price or limit |
| --- | --- |
| Hobby | $5 monthly minimum, including $5 resource usage; additional usage billed |
| Pro | $20 monthly minimum, including $20 resource usage; additional usage billed |
| RAM | $0.00000386 per GB-second, approximately $10 per continuously used GB per 30 days |
| CPU | $0.00000772 per vCPU-second, approximately $20 per fully used vCPU per 30 days |
| Volumes | $0.00000006 per GB-second, approximately $0.156 per GB per 30 days |
| Service egress | $0.05 per GB |
| Free plan | Up to 0.5 GB RAM per service and 0.5 GB volume storage |
| Hobby volume limit | Up to 5 GB per service on the published comparison |

The resource figures are rates, not an estimated total for Kkeep. Runtime memory, CPU usage, storage, and actual streaming traffic are not measured yet. Egress alone would cost $5 for 100 GB or $50 for 1,000 GB at the quoted rate, before other resources and applicable charges. A connected Railway account and trial credits do not authorize paid resource creation. The Free limits do not meet the documented Invidious server requirements, and Hobby storage may also be too small for the documented disk allocation. Do not advertise this backend as free or quote a precise monthly bill without measuring and agreeing a cap.

## Integration and remaining acceptance checks

Kkeep's server needs `INVIDIOUS_URL` and a secret `INVIDIOUS_API_KEY`. The Caddy recipe verifies `X-Kkeep-Backend-Key`; the browser never receives it. Invidious login and registration stay disabled, and Kkeep Profile owns user state. Companion remains private with no `public_url`, allowing one fixed backend origin.

The current player uses progressive MP4 `formatStreams` from `/api/v1/videos/:id?local=true`. Availability and resolution depend on the formats YouTube provides; missing compatible formats, live streams, restricted videos, upstream failures, and anti-bot checks can still prevent playback. No external YouTube/Google account is stored. Native playback requires server-side Range forwarding and careful validation of all stream URLs and redirects. History stores IDs and positions, not expiring media URLs.

Before launch: choose a suitable host and authorized spend limit, build both pinned images, verify the three services and TLS gateway, set Kkeep's server variables, test search plus a permitted public video, seeking, profile isolation, unavailable-video handling, and source archive download. Publish the generated `kkeep-youtube-source.tar.gz` with the Kkeep source link. No live availability or playback claim is justified until these checks pass.
