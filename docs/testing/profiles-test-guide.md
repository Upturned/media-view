# Test guide — local profiles

Everything profiles add (`docs/profiles.md`), as a checklist. Tick each box when it behaves as described; when it doesn't, note the page, what you did and what happened.

**Before you start**

- Work on a **copy** of a library. Opening a library with this build upgrades it (migration 007), and **older builds refuse it afterwards** (*made by a newer version*).
- Build first: `npm run build`, then `npm start`.

---

## 1. The upgrade

- [ ] Before upgrading, note a few starred images. Open the library copy: it opens straight in, as before, with your picture (initials) at the right end of the top bar.
- [ ] The profile is named after your Windows user. Your stars are all there (Favorites, the ★ in the viewer).
- [ ] Grid settings you had (columns, sort, group, index) and the slideshow settings came through.
- [ ] Open the same copy with the previous build: it refuses it, saying it was made by a newer version.

## 2. One profile looks like before

- [ ] With one profile and no password, nothing asks who you are, and logs (Health → Open logs folder) have no `profile` field.
- [ ] Collection pages don't show *created by*. Health's duplicates say *★ starred*, not who.

## 3. Your profile page

- [ ] The profile menu (click or right-click your picture): *Your profile*, *Switch profile…*, *Settings* (and *Lock* once you have a password).
- [ ] **Rename…**, **Picture…** (favorites first; type to search the library, `#tag` works; *No picture* goes back to initials) and the color squares (only without a picture).
- [ ] **Link a tag…** as *Creator*: its images show under **Images by me**, with **See all** opening a search like `~#artist:name`.
- [ ] Link a tag as *Subject*: **Featuring you** fills. × unlinks.
- [ ] With no tags linked, the sections say so and show no images (not every image).
- [ ] An image tagged with a tag that **implies** a linked tag shows up too.
- [ ] Two tags with the same name in different types (e.g. *alice* as Character and as Artist): linking one shows only its images.

## 4. Linking from tags

- [ ] Right-click any tag chip: *This is me · Images by me* and *This is me · Featuring you* link it; a toast confirms.
- [ ] On a tag's wiki page, **This is me ▸** shows both roles; the one you hold has a ✓ and unlinks. Under the name, **linked to Felipe · creator** links to the profile.
- [ ] With a second profile, try to link a tag someone else holds in that role: refused, naming them.
- [ ] Merge a linked tag into another: the link moves to the target (unless the target already has someone in that role).

## 5. A second profile

- [ ] Settings → Profiles → **New profile…** with a password (typed twice; a mismatch is flagged). The note about what a password does and doesn't protect is there.
- [ ] Your row has *Rename… / Picture… / Password…*; the other has *Switch to… / Delete…*.
- [ ] **Switch to…** asks the password; a wrong one says *Wrong password.* after a short pause. The right one reloads the app as that profile.
- [ ] The new profile has **no stars** and default grid settings; star a few images. Switch back: your stars are yours, theirs are theirs.
- [ ] *Lock* (profile menu) shows **Who's using media-view?**: cards with pictures, a 🔒 on protected ones, **+ New profile**. No top bar. Arrows move between the cards; Enter opens.
- [ ] Close the app and start it again: it opens the last profile used here, or the cards if that one has a password.
- [ ] Two browser tabs: switch profile in one; the other reloads by itself.

## 6. Stars protect images for everybody

- [ ] As profile B, star an image. As profile A, recycle it: refused, *Starred by B*. Recycle a selection that includes it: the others go, a toast says how many were kept and who starred them.
- [ ] As A, recycle the folder holding it: refused, saying how many images each profile starred.
- [ ] Move or copy an image onto it with *Replace*: it keeps both instead.
- [ ] Duplicates with copies starred by A and B: Health says who starred each copy, *Keep one* is refused (naming who), **Merge into…** gives the kept copy both stars.

## 7. Collections, deleting, logs

- [ ] A collection made as B shows **created by B** in its header (with two or more profiles).
- [ ] Delete profile B from Settings (asks first, listing its favorites and tag links; then its password). Its stars and links go; its collections stay, without *created by*.
- [ ] The last profile, and the one in use, can't be deleted.
- [ ] With two profiles, a bulk action (star several images, a Health fix) writes a log line with `profile: { uuid, name }`.

## 8. Forgotten password

- [ ] From the app folder: `npm run profile:reset-password -- "<library path>" "<profile name>"` clears it; the app then opens that profile without asking.
- [ ] In the portable zip (`npm run package`): double-click **reset-password.bat**; it asks for the library folder and lists the profiles with a password.

## 9. Help

- [ ] F1 on the picker, a profile page, Settings, Favorites, a wiki page and a collection mentions profiles.
