# Sakura desktop

Desktop distribution documentation for **Sakura**, a reading, anime, and community application.

**This repository currently contains documentation and policy files only.** It does not contain a desktop application, packaging project, build scripts, or a verified installer. The repository name is not a claim that a desktop release can be built from this checkout.

Use [Sakura on the web](https://sakuraonseeker.com/app/) for the live application. Current shared application work targets Expo and belongs in [Sakura-11488/Sakura](https://github.com/Sakura-11488/Sakura). That repository's public default branch still contains historical source; reconciling it with the current application is a tracked milestone.

## Repository map

| Repository | Role |
| --- | --- |
| [Sakura](https://github.com/Sakura-11488/Sakura) | Application project; historical public default, current Expo source reconciliation pending |
| [sakura-web](https://github.com/millw14/sakura-web) | Hosting and generated web export |
| [Sakura-ios](https://github.com/Sakura-11488/Sakura-ios) | Historical Next.js/Capacitor iOS snapshot |
| [sakura-perps](https://github.com/Sakura-11488/sakura-perps) | Perps research and Rooms paper-beta engine/service |
| [ino-sakura-registry](https://github.com/Sakura-11488/ino-sakura-registry) | Experimental Solana milestone records |

Sakura Rooms is an invite-only paper beta with fixed simulated scenarios and no real funds. This desktop documentation repository does not implement its service or a trading client.

## Before a desktop release

Desktop distribution needs a defined source revision and supported operating systems, reproducible packaging, a verified signing and update process, and installation/recovery checks on supported devices. A release should publish the artifact identity and checks performed rather than relying on screenshots or a repository name.

Keep new platform work aligned with the shared application. Do not recreate the retired Next.js UI or treat historical mobile packaging as proof of a desktop build.

## Contributing and policies

Use issues here for desktop distribution requirements and documentation corrections. Put shared UI changes in the application repository. No application build or test command is available in this checkout.

Existing [Copyright](COPYRIGHT.md), [Privacy](PRIVACY.md), and [Terms](TERMS.md) documents are retained. Their descriptions of the wider service do not establish that those features are implemented in this repository. This documentation update does not change their terms or grant a new software license.
