# FestPAL Sprint Planning Meeting

**Participants:** Arjun, Meera, Priya, Rohan  
**Duration:** 05:19  
**Evidence check:** 12/12 items grounded (100%)  

## Executive summary

The team discussed the development of the FestPAL app for TechNova, deciding on the tech stack and key features. The live leaderboard was deferred to a future version due to time constraints. Action items were assigned, including design tasks and API development, with a timeline set for code freeze and Play Store submission. Risks regarding Wi-Fi reliability and sponsor logos were noted, along with an open question about payment processing.

## Topics

- **[00:00] Introductions and Project Overview** - Participants introduced themselves, and Priya outlined the project timeline, emphasizing the need for the app to be on the Play Store before March 20.
- **[00:40] Tech Stack and Features Discussion** - The team agreed to use Flutter for development and Firebase for authentication and notifications. The live leaderboard feature was cut from version one.
- **[01:51] Action Items and Responsibilities** - Rohan requested the final event list, which Priya will provide by Monday. Rohan will build the event schedule API by Friday, while Meera and Arjun have design and testing tasks due Wednesday and Thursday, respectively.
- **[02:33] Risks and Open Questions** - The team identified risks related to Wi-Fi reliability and the need for sponsor logos. An open question about payment processing was raised, and a timeline for code freeze and submission was established.

## Decisions

- ✓ Festpal will be built in Flutter. _(at 01:02; "Okay, then it's decided: Festpal will be built in Flutter!")_
- ✓ We'll use Firebase for authentication and push notifications. _(at 01:15; "Agreed! We'll use 'Firebase' for authentication and push notifications.")_
- ✓ Cut the live leaderboard from version one and move it to version two. _(at 01:45; "Then, let's cut the live leader board from version one and move it to version two.")_
- ✓ Code freeze on March fourteenth and Play Store submission on March sixteenth. _(at 05:08; "Great, that's agreed then-code freeze on march fourteenth and playstore submission on march sixteenth.")_

## Action items

| | Owner | Task | Due | Priority | Evidence |
|---|---|---|---|---|---|
| ✓ | Priya | Get the cleaned event list and venue data from the fest committee | Monday | high | 02:01 (S17) |
| ✓ | Rohan | Build the event schedule and registration API | Friday | high | 02:08 (S18) |
| ✓ | Meera | Finish the high fidelity designs for the schedule and map screens | Wednesday | high | 02:16 (S19) |
| ✓ | Arjun | Write the test plan and set up testing on five Android phones | Thursday | high | 02:21 (S20) |
| ✓ | Rohan | Set up push notifications with Firebase Cloud Messaging | Tuesday | high | 03:12 (S27) |
| ✓ | Priya | Email the sponsors for their logo files | Wednesday | high | 03:42 (S32) |
| ✓ | Meera | Create the app icon and the splash screen | Friday | high | 03:47 (S33) |
| ✓ | Arjun | Run the load test on the registration end point | March twelfth | medium | 04:18 (S38) |

## Open questions

- Does the campus map need to work offline? _(at 02:49)_
- What is the payment processing method for paid workshops? _(at 04:26)_

## Risks

- The campus Wi-Fi may collapse during the fest, so the app has to work offline. _(at 02:33)_
- Rohan is also maintaining the fest website, which could delay the registration API. _(at 03:53)_

_✓ = evidence verified against the transcript; ⚠ = needs review (cited evidence missing or not matching)._
