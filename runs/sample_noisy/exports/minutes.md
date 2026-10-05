# FestCal Sprint Planning Meeting

**Participants:** Arjun, Meera, Priya, Rohan  
**Duration:** 05:19  
**Evidence check:** 11/11 items grounded (100%)  

## Executive summary

The team discussed the upcoming sprint for the FestCal app, which must be ready before the fest starting March 20. Key decisions included using Flutter for development and Firebase for authentication. Action items were assigned, including design tasks and API development, with a code freeze set for March 14 and Play Store submission on March 16. Several risks were identified, including potential issues with the campus Wi-Fi and the need for sponsor logos.

## Topics

- **[00:00] Introductions and Sprint Overview** - Participants introduced themselves, and Priya outlined the sprint timeline, emphasizing the need to launch the app before March 20.
- **[00:40] Technical Stack and Features** - The team agreed to use Flutter for development and Firebase for authentication. They decided to exclude the live leaderboard feature from the first version.
- **[01:51] Action Items and Deadlines** - Action items were assigned with specific deadlines, including cleaning the event list, designing screens, and setting up APIs. A code freeze and submission date were also agreed upon.
- **[02:33] Risks and Open Questions** - The team identified risks related to Wi-Fi reliability and the need for sponsor logos. They left some questions open regarding payment processing.

## Decisions

- ✓ FestPal will be built in Flutter. _(at 01:02; "Okay, then it's decided. FestPal will be built in Flutter.")_
- ✓ We'll use Firebase for authentication and push notifications. _(at 01:15; "Agreed. We'll use Firebase for authentication and push notifications.")_
- ✓ Cut the live leaderboard from version one and move it to version two. _(at 01:45; "Then let's cut the live leaderboard from version one and move it to version two.")_
- ✓ Code freeze on March fourteenth and Play Store submission on March sixteenth. _(at 05:08; "Great, that's agreed then. Code freeze on March fourteenth and Play Store submission on March sixteenth.")_

## Action items

| | Owner | Task | Due | Priority | Evidence |
|---|---|---|---|---|---|
| ✓ | Priya | Get the cleaned event list and venue data from the fest committee | Monday | high | 02:01 (S16) |
| ✓ | Rohan | Build the event schedule and registration API and have it on staging | Friday | high | 02:08 (S17) |
| ✓ | Meera | Finish the high fidelity designs for the schedule and map screens | Wednesday | high | 02:16 (S18) |
| ✓ | Arjun | Write the test plan and set up testing on five Android phones | Thursday | high | 02:21 (S19) |
| ✓ | Priya | Email the sponsors for their logo files | Wednesday | high | 03:42 (S29) |
| ✓ | Meera | Create the app icon and the splash screen in Technova colors | Friday | medium | 03:46 (S30) |
| ✓ | Arjun | Run the load test on the registration end point | March twelfth | medium | 04:18 (S35) |

## Open questions

- Does the campus map need to work off-line? _(at 02:49)_
- Will paid workshops be paid inside the app, or do we just link to the college payment portal? _(at 04:26)_

## Risks

- The campus wi-fi collapses during the fest, so the app has to work off-line. _(at 02:33)_
- If the FESC website breaks, the registration API could slip by a couple of days. _(at 03:53)_

_✓ = evidence verified against the transcript; ⚠ = needs review (cited evidence missing or not matching)._
