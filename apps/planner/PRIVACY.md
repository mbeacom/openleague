# OpenLeague Planner Privacy Policy

**Effective October 13, 2026**

This policy covers the OpenLeague Planner, the free practice planner and team rankings tool at [openleague.dev/planner](https://openleague.dev/planner/) (the "Planner"). The hosted OpenLeague app at openl.app has its own [privacy policy](https://openl.app/privacy).

The Planner is local-first. It runs entirely in your web browser, has no accounts, and has no OpenLeague server behind it. OpenLeague does not receive, collect or store the practices, drills, rankings or files you create with it.

## What the Planner stores, and where

Everything you create is kept in your browser's own storage (IndexedDB) on your device:

- practice plans, drills, play diagrams and notes, which can include the names you type in, such as players' names
- rankings documents: league schedules, scores and team lists you paste or import
- settings, including which cloud storage you use and your AI assistance setup
- for each document you save to a file or to cloud storage, a link record: the file's ID, name and the revision this device last read or wrote, so the Planner can save to the same file again and detect changes made elsewhere

This data never leaves your device unless you take one of the actions described below. Your browser can clear site data, and clearing it deletes this data. You can download plan files at any time to keep a backup.

The Planner uses no cookies, analytics, advertising or tracking.

## Google Drive

Saving to Google Drive is optional. If you choose it, the Planner connects to your Google account directly from your browser.

**What the Planner accesses.** The Planner asks for one permission, the `drive.file` scope. With it, the Planner can reach only:

- files and the "OpenLeague" folder that the Planner itself creates in your Drive, and
- files you choose yourself in the Google file picker.

It cannot see, list or open any other file in your Drive. The Planner does not request your email address, contacts or any other Google data.

**What the Planner reads and writes.** Within those files, the Planner:

- creates an "OpenLeague" folder and saves your plan and rankings files in it
- reads, updates and lists those files, and files you pick, so you can open them on another device
- tags its files with private app properties (a document type and ID) so it can find them again
- reads file details: name, type, size, modified time, revision and whether you can edit the file. It also reads the display name of the person who last changed a file, which is shown only to you in the file list and when two devices change the same file.

**How the data is used.** Google user data is used only to provide the Save to and Open from features you choose: storing your files in your Drive, opening them, and warning you before one device overwrites another's changes. It is not used for any other purpose. It is not used for advertising, and it is not used to develop, improve or train AI or machine learning models.

**Where the data goes.** Files travel directly between your browser and Google. They are never sent to OpenLeague or anyone else, and OpenLeague has no server that could receive them. Google user data is not sold, and is not transferred or disclosed to any third party.

**Access tokens.** Sign-in uses Google Identity Services in your browser. The access token Google issues is held in the page's memory only. It is never written to browser storage, a file, a link or a log, and no refresh token is requested. When you reload the page or the token expires, the Planner asks again.

**Retention and deletion.**

- Files you save stay in your Google Drive until you delete them there. Removing the Planner's access does not delete them.
- The link records described above stay in your browser until you clear the Planner's site data.
- You can revoke the Planner's access at any time in your Google Account, under **Security → Your connections to third-party apps & services** ([myaccount.google.com/connections](https://myaccount.google.com/connections)).

**Google API Services User Data Policy.** The Planner's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## Microsoft OneDrive

Saving to OneDrive is optional and works like Google Drive. The Planner requests the `Files.ReadWrite.AppFolder` permission, which limits it to the Planner's own app folder in your OneDrive, and `User.Read` for sign-in. Files travel directly between your browser and Microsoft. Microsoft's sign-in library keeps its tokens in session storage, which is cleared when you close the tab. You can remove the Planner's access in your Microsoft account settings.

## AI assistance

AI assistance is optional and off until you set it up with a provider and key of your choice. Nothing is sent until you press Send. When you do, your browser sends the request shown in the preview directly to the provider you configured, using your key. It does not go through OpenLeague. What the provider does with the request is governed by that provider's own terms and privacy policy. Your key is kept in the page's memory for the life of the tab and is not saved.

Google user data obtained through Google Drive is never sent to AI providers by the Planner. A plan you opened from Drive is included in a request only if you put its content in the preview and press Send yourself.

## Rankings: "Fetch it for me"

If you use "Fetch it for me" in Rankings, the Planner opens the hosted OpenLeague app at openl.app, which fetches the public league schedule page you name for a signed-in account and hands the schedule back to the Planner. The hosted app's [privacy policy](https://openl.app/privacy) covers that request.

## Fonts and hosting

The Planner is served by GitHub Pages and loads fonts from Fontshare and Google Fonts. Like any website, these services receive your IP address and standard browser information when your browser requests files from them.

## Children

The Planner is a tool for coaches and team staff. It has no accounts and collects no information from anyone, including children. Names that a coach types into a plan stay on the coach's device or in the coach's own cloud storage.

## Changes to this policy

When this policy changes, the updated version is published on this page with a new effective date.

## Contact

Questions about this policy: [support@openl.app](mailto:support@openl.app).
