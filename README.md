# Tampermonkey Userscripts

## About this repo

A collection of Tampermonkey userscripts by [mlajkim](https://github.com/mlajkim). Each userscript lives in its own directory with setup instructions, source code, and supporting files.

## Userscripts

| Userscript | What it does |
| --- | --- |
| [Google Meet Transcript](google_meet_transcript/README.md) | Collects Meet captions automatically, backs up the full transcript every 30 minutes, and downloads remaining changes when the meeting ends |
| [Google Meet Auto Video Off](google_meet_auto_video_off/README.md) | Saves bandwidth by turning off participants' camera feeds while keeping shared content visible |

## How to setup

### Step 1. Install Tampermonkey

Install [Tampermonkey](https://www.tampermonkey.net/) in your browser and enable userscripts if prompted.

### Step 2. Choose and install a userscript

Open a userscript's setup guide from the table above. Follow its instructions to add the `.user.js` file to Tampermonkey and configure the matching website.

## Development

Requires Node.js 22 or newer; no dependency installation is needed for the current scripts. Run these commands from the repository root:

```sh
npm test
npm run build
npm run check
npm run test:browser
```

The root commands run across the projects listed in `package.json` under `workspaces`. You can also run the same commands from an individual script's directory; see its README for any additional requirements.

To add another userscript, give it a separate top-level directory and add it to the table above. Register scripts that use Node.js in the root `workspaces` list so the shared commands include them.
