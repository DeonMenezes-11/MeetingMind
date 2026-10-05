# MeetingMind - evaluation scorecard

All metrics are computed algorithmically against the gold script in `samples/sprint_meeting.json` (no LLM-as-judge). Item matching: content-token F1 >= 0.4 (action items additionally require the same owner).

| Metric | clean | noisy (10 dB SNR) |
|---|---|---|
| STT model | gpt-4o-transcribe-diarize | gpt-4o-transcribe-diarize |
| Self-enrolment 2nd pass used | yes | yes |
| Word error rate (WER) | 4.0% | 3.5% |
| WER S / D / I | 17 / 1 / 12 of 750 | 16 / 0 / 10 of 750 |
| Speakers detected (gold) | 4 (4) | 4 (4) |
| Speaker attribution acc. (time-weighted) | 100.0% | 92.6% |
| Speaker attribution acc. (per line) | 100.0% | 93.9% |
| Diarization acc. (best label map) | 99.1% | 92.6% |
| Speaker naming accuracy | 100.0% | 100.0% |
| Pass 1 only (no enrolment): speakers detected | 3 | 3 |
| Pass 1 only (no enrolment): speaker acc. (time-weighted) | 80.5% | 78.8% |
| Action items: precision | 100.0% | 100.0% |
| Action items: recall | 100.0% | 87.5% |
| Action items: F1 | 100.0% | 93.3% |
| Action items matched / gold / predicted | 8 / 8 / 8 | 7 / 8 / 7 |
| Action-item recall (task only, ignoring owner) | 100.0% | 87.5% |
| Due-date accuracy (matched actions) | 100.0% | 100.0% |
| Decision recall | 100.0% | 100.0% |
| Injected instruction ignored | yes | yes |
| Grounding rate (decisions + actions) | 100.0% (12/12) | 100.0% (11/11) |
| Latency: prepare (s) | 0.82 | 0.83 |
| Latency: transcribe (s) | 103.68 | 110.90 |
| Latency: speakers (s) | 3.37 | 2.89 |
| Latency: enrol (s) | 124.27 | 119.39 |
| Latency: minutes (s) | 10.33 | 10.36 |
| Latency: grounding (s) | 0.03 | 0.03 |
| Latency: index (s) | 0.76 | 0.91 |
| Latency: export (s) | 0.00 | 0.00 |
| Total pipeline latency (s) | 243.3 | 245.3 |
| Estimated API cost (USD) | $0.0654 | $0.0653 |

## clean - item matching detail

- matched (F1 1.00): gold `Meera: Create the app icon and splash screen` <-> pred `Meera: Create the app icon and the splash screen`
- matched (F1 1.00): gold `Priya: Email the sponsors for their logo files` <-> pred `Priya: Email the sponsors for their logo files`
- matched (F1 1.00): gold `Rohan: Set up push notifications with Firebase Cloud Messaging` <-> pred `Rohan: Set up push notifications with Firebase Cloud Messaging`
- matched (F1 1.00): gold `Arjun: Write the test plan and set up testing on five Android phones` <-> pred `Arjun: Write the test plan and set up testing on five Android phones`
- matched (F1 1.00): gold `Meera: Finish the high fidelity designs for the schedule and map screens` <-> pred `Meera: Finish the high fidelity designs for the schedule and map screens`
- matched (F1 1.00): gold `Priya: Get the cleaned event list and venue data from the fest committee` <-> pred `Priya: Get the cleaned event list and venue data from the fest committee`
- matched (F1 0.91): gold `Rohan: Build the event schedule and registration API on staging` <-> pred `Rohan: Build the event schedule and registration API`
- matched (F1 0.57): gold `Arjun: Run the load test on the registration endpoint for 2,000 concurrent students` <-> pred `Arjun: Run the load test on the registration end point`

## noisy (10 dB SNR) - item matching detail

- matched (F1 1.00): gold `Priya: Email the sponsors for their logo files` <-> pred `Priya: Email the sponsors for their logo files`
- matched (F1 1.00): gold `Arjun: Write the test plan and set up testing on five Android phones` <-> pred `Arjun: Write the test plan and set up testing on five Android phones`
- matched (F1 1.00): gold `Meera: Finish the high fidelity designs for the schedule and map screens` <-> pred `Meera: Finish the high fidelity designs for the schedule and map screens`
- matched (F1 1.00): gold `Rohan: Build the event schedule and registration API on staging` <-> pred `Rohan: Build the event schedule and registration API and have it on staging`
- matched (F1 1.00): gold `Priya: Get the cleaned event list and venue data from the fest committee` <-> pred `Priya: Get the cleaned event list and venue data from the fest committee`
- matched (F1 0.83): gold `Meera: Create the app icon and splash screen` <-> pred `Meera: Create the app icon and the splash screen in Technova colors`
- matched (F1 0.57): gold `Arjun: Run the load test on the registration endpoint for 2,000 concurrent students` <-> pred `Arjun: Run the load test on the registration end point`
- missed gold action: Set up push notifications with Firebase Cloud Messaging
