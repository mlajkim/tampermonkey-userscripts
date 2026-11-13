# Google Meet Auto Video Off

[All userscripts](../README.md)

Incoming camera video uses network bandwidth, and sometimes you want to keep that traffic down. This Tampermonkey userscript turns off other participants’ **camera feeds in your view** in one pass per call using Meet’s **Don’t watch / Turn off video** action, then stops. Shared screens and shared videos are excluded; it does not select Audio only or change Receive resolution.

## Setup / update

1. Install [Tampermonkey](https://www.tampermonkey.net/) and allow userscripts in your browser
2. Open Tampermonkey → **Create a new script**, or edit the existing **Google Meet Auto Video Off** entry
3. Replace the editor contents with [google-meet-auto-video-off.user.js](google-meet-auto-video-off.user.js), then save
4. Reload the Meet tab and join a call

Version **0.3.0** runs one pass per call and shows **Done** when it finishes. Editing the file in this repository does not update the copy installed in Tampermonkey; replace that copy and reload Meet. Check that the panel shows **v0.3.0**.

The **Auto video off** panel appears at the bottom left. On joining, the script opens Meet’s **People / Show everyone** panel and turns off the incoming camera feed for each recognized participant. It also checks visible camera tiles, including tiles without a `<video>` element. English, Japanese, and Korean controls are supported.

The script scans scrollable People lists once per join and restores the starting scroll position; interacting with that list stops the automatic scan. Once the pass finishes, the panel shows **Done** and the script stops opening participant menus or scanning for new cameras. People stays open, but later arrivals are left alone. **Apply again** starts a new pass only when you click it.

After turning off a camera feed, the script reopens that participant’s menu once to check that **Start watching / Turn on video** is available. Only then does it count the feed as off. **Unconfirmed** means it could not locate or verify a control; there are no automatic retries. A pass interrupted by your input or **Pause** can continue when automation resumes.

## Controls

- **Pause** stops the current pass; feeds already turned off stay off
- To watch someone again, choose **Start watching / Turn on video** in their Meet menu; handled participants are left alone for the rest of that join
- **Resume** continues an unfinished pass; Pause/Resume is disabled after **Done**
- **Apply again** starts another pass over all recognized participants
- Leaving and rejoining, switching meeting rooms, or reloading the page starts with automation enabled again
- To stop using it, disable the userscript in Tampermonkey and reload Meet; restore individual feeds through Meet if needed

The script waits for your open menus and dialogs, except Meet’s non-modal **Send a reaction** tray, and yields when you interact with Meet. It does not change your outgoing camera, microphone, audio playback, or other participants’ views.

## Troubleshooting and limits

- **No panel:** check that the userscript is enabled for `meet.google.com`, your browser permits userscripts, and you reloaded the tab after saving
- **Waiting for a call:** join first; call detection recognizes Leave call labels and Meet’s call-end icon
- **Waiting for the open Meet menu or dialog to close:** close that menu or dialog so the script can open a participant’s menu
- **Done · Camera feeds off: 0:** the pass found no supported camera controls; **Apply again** can try a new pass once participants and their controls are available
- **Unconfirmed:** the native control was unavailable or its changed state could not be verified; **Apply again** retries after a layout or control change
- Meet’s markup can change; this version is tested with local browser fixtures, not a live call
- Presentation and self-view exclusions depend on Meet’s markers and labels; ambiguous presenting entries are skipped to preserve shared content
- If you interrupt the automatic People-list scan, scroll the list yourself or use **Apply again** to expose any remaining participants
- Cameras can briefly appear while the per-participant actions run; this is not a transport-level block before the first frame
- Bandwidth savings depend on Meet honoring its native incoming-camera control; the script does not measure traffic or alter WebRTC connections
- The script makes no network requests and stores no meeting data

## Development

Edit the installable `.user.js` file directly; no build or dependency installation is needed. From this directory, run:

```sh
npm run check
npm run test:browser
```

The browser checks use an installed Chrome or Chromium, a fresh temporary profile, and local simulated Meet pages. Set `CHROME_BIN` if the browser is not found automatically. The collection’s root commands also include this script.

The fixtures use synthetic participants, meeting IDs, and generic controls. They cover a People button with a count, the reaction tray, and a Trusted Types policy for panel startup. Camera-menu actions remain simulated; these checks do not establish live-call compatibility.
