# RimSocial screen rules

These rules describe how each screen must behave. They apply to the web app, the Android (Capacitor) app and any future React Native app. Keep them in step with the code.

## Global rules
- Moving between screens never waits on the network. Screens draw from saved data first; the network is only used to fetch new data.
- No loading text and no error text on any screen. Load behind the screen. Log errors instead of showing them.
- Back returns to the screen the person came from. Lists and sheets have their own address, so Back returns to them.
- Tabs switch with replace, so tab moves do not stack history.
- A fresh start (not a return from the background) opens on Stories. Signing in also opens Stories. Deep links such as posts and chats still open their own page.
- Do not change the design unless asked. Match the reference screenshots.

## Bottom bar
- Five tabs in this order: Stories, Chat, Add (no label, yellow plus), Rimlight, Profile.
- Labels are 10px, weight 400. The Add button has no label.
- Active tab: icon filled in the tab's text colour. Inactive: outline icon.
- Hidden on the Add screen, on profile, on chat conversations and on full-screen viewers.
- Swiping left or right between tabs is allowed, with a slide animation.

## Stories (first tab)
- Top bar: profile picture (to own profile), search, title "Stories", bell (to activity), add friend, more.
- Row header: "My Stories" and "Friends". At the start of the row, "My Stories" is bold and "Friends" is light gray. Once the row has scrolled past the first circle, "Friends" is bold and "My Stories" is light gray.
- A thin light-gray vertical divider sits between My Story and the friends.
- My Story first, then friends ordered by interaction and recency.
- Each circle shows the latest story's picture. If the person has no story, their profile picture shows.
- Ring: purple while any story in that person's group is unwatched. Grey once every story has been watched. My Story follows the same rule. No other icons on the ring.
- Discover below the row: suggested people, ranked by the server.
- Tapping a ring opens the story viewer. Tapping a suggested person with no story opens their profile.
- The saved rail and Discover list show at once. The server is asked again only when the rail is older than 30 seconds, or Discover is older than 10 minutes.
- The "Create a story" text only appears after the first load has finished.

## Story viewer
- Stories play in order and move to the next person when finished.
- A story is recorded as viewed when it is shown.
- Closing the viewer refreshes the rail. Stop all playback when the app is minimised or closed.

## Chat (second tab)
- Unread count shows as a badge on the tab.
- A chime plays when the unread count goes up.

## Add (third tab, centre)
- Step 1, gallery: header with a down chevron (close), the title "Post To Story" for stories or "Post" for posts, and a camera button.
- Tabs: Memories (the person's own posts) and Camera Roll.
- The Camera Roll grid starts with a camera tile and a pick-from-phone tile, followed by recently picked items.
- Step 2, editor: full-screen preview with rounded corners. Close returns to the gallery.
- A caption pill at the top opens the caption and options sheet.
- Right-hand tools: a T that opens the sheet, and a volume button for videos.
- Bottom row: a save-to-phone button, "+ Post" (posts with the sheet's options) and "My Story" (posts to stories).
- Video is trimmed to the post length (20 minutes) or the story length (60 seconds).
- Caption and options sheet: caption (500 characters for posts, 200 for stories), topic, who can see it (public or only me), share to story, allow remixing, AI label, paid partnership with sponsor details.
- Gallery grid of the phone's own photos needs a native media plugin. Until it is added, the picker is used.

## Rimlight (fourth tab)
- Full-screen vertical video feed. Dark bottom bar.

## Profile (fifth tab, and any other person's profile)
- Header: back (own profile only when opened from elsewhere), bell (only when following), share, more.
- Own profile: share and settings. Other people: Add or Following button, and a round chevron for the options sheet.
- Counts for Followers and Following open lists at their own addresses: `/u/<username>/followers` and `/u/<username>/following`.
- Lists: search, sorting label, Add or Following per person. Tapping a person opens their profile. Back returns to the list.
- Activity (own profile only): list of follows, likes, comments, reposts, mentions and new posts. Tapping a row opens that person's profile.
- Blocked accounts: list with Unblock. Opened from the options sheet.
- Tabs: Spotlight, Stories, Reposts.

## Explore and Find friends
- Explore is hidden from the bottom bar but its route still exists.
- Find friends slides up from the bottom and covers the bottom bar.
- Search opens from the search button on Stories. Back returns to Stories.

## Edit profile
- Name (64 characters), bio (150), website (200), city (80).
- Save returns to the profile. Back does not save.

## Story and post viewers
- Share sheet: reactions row, Send Snap, then extra rows (Favorites, Block, Copy link).
- Lists and viewers close by going back in history, not by sending the person somewhere else.
